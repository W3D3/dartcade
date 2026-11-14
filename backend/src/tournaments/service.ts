import type { Kysely } from 'kysely'
import { warn } from '../log.js'
import type { Database } from '../db/schema.js'
import { ownBoardSeats } from '../db/lobbies.js'
import { matchRatings, type MatchRating } from '../db/ranked.js'
import {
  dropIneligibleEntries,
  moveMatch,
  moveTournament,
  type MatchMove,
  type TournamentMatchRow,
  type TournamentRow,
} from '../db/tournaments.js'
import {
  deleteMatches,
  finishWithPlaces,
  getTournamentRow,
  latestGame,
  linkSeats,
  listEntries,
  listMatches,
  runningTournamentIds,
  scheduledTournaments,
  seatResults,
  setSides,
  sideOfSeat,
  setStartTime,
  tournamentOfMatch,
  writeDraw,
  type RunEntry,
} from '../db/tournamentRun.js'
import { releaseUnconfirmed } from '../db/tournamentRoster.js'
import { games } from '../games/index.js'
import type { GameEnded, GameEndedConsumer, SessionEngine } from '../session/engine.js'
import type { TournamentCheckInMessage, TournamentDroppedMessage, TournamentMatchMessage } from '../schema/lobby-ws.js'
import { seedEntries, type Seeding } from '../shared/tournaments/bracket.js'
import { drawFor, finalPlaces, isComplete, samePlace } from '../shared/tournaments/run.js'
import { before, bracketOf, placeOf, seededOf, setupOf } from './bracketRows.js'
import { registrationOpen } from '../shared/tournaments/registration.js'
import { KeyedQueue } from '../util/keyedQueue.js'

/** How often due check-ins and starts are opened and running brackets move on. */
const TICK_MS = 5_000

export type TournamentDeps = {
  db: Kysely<Database>
  engine: Pick<SessionEngine, 'getSessionByUser' | 'getSessionByBoard' | 'createWithSeats' | 'deleteSession'>
  /** The player has a /ws/me socket open (FriendsService.isOnline). */
  isOnline: (userId: string) => boolean
  /** LobbyHub.sendTournament. */
  send: (userId: string, msg: TournamentCheckInMessage | TournamentDroppedMessage | TournamentMatchMessage) => void
  now?: () => number
  random?: () => number
  warn?: (message: string, details: unknown) => void
}

export type StartOutcome = 'started' | 'not_startable'

const sidesOf = (r: TournamentMatchRow): [string | null, string | null] => [r.entry_a_id, r.entry_b_id]
type Seated = { id: string; userId: string; name: string }
/** An entry's players in team order (a solo entry has one), when every one has an account (only accounts play online). */
function playersOf(e: RunEntry): Seated[] | null {
  const seated = e.players.flatMap(p => (p.userId === null ? [] : [{ ...p, userId: p.userId }]))
  return seated.length > 0 && seated.length === e.players.length ? seated : null
}
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)
const involves = (r: TournamentMatchRow, entryId: string) => r.entry_a_id === entryId || r.entry_b_id === entryId

/**
 * Runs online tournaments (issue #606): opens check-in, draws the bracket at the start, starts each
 * match's game once both players are online and free, gives a no-show's match to the other side,
 * records each game's result and finishes the tournament with everyone's place. Each tournament's
 * changes run one after another on its own lane. Nothing is kept in memory: every step reads the
 * rows and rebuilds the bracket from the seeds and results (shared/tournaments/run.ts), so a
 * restart picks up where it was, timers included (they count from stored times).
 */
export class TournamentService implements GameEndedConsumer {
  private readonly lanes = new KeyedQueue()
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly deps: TournamentDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private warn(message: string, details: unknown = {}): void {
    ;(this.deps.warn ?? warn)(message, details)
  }

  /** Moves a match, stamped with this service's clock (the no-show wait reads the stamps). */
  private move(matchId: string, move: MatchMove) {
    return moveMatch(this.deps.db, matchId, move, new Date(this.now()))
  }

  private lane<T>(tournamentId: string, task: () => Promise<T>): Promise<T> {
    return this.lanes.run(tournamentId, task)
  }

  start(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => {
        this.warn('tournament tick failed', { error: String(err) })
      })
    }, TICK_MS)
    this.timer.unref()
  }

  close(): void {
    clearInterval(this.timer)
  }

  /** Opens due check-ins, starts due tournaments and moves every running bracket on. */
  async tick(): Promise<void> {
    for (const t of await scheduledTournaments(this.deps.db)) await this.lane(t.id, () => this.schedule(t.id))
    for (const id of await runningTournamentIds(this.deps.db)) await this.lane(id, () => this.step(id))
  }

  /** The engine's `ended` hook: a tournament game's result (or its abort) moves its match. */
  async onGameEnded(e: GameEnded): Promise<void> {
    if (e.tournamentMatchId === null) return
    const tournamentId = await tournamentOfMatch(this.deps.db, e.tournamentMatchId)
    if (tournamentId !== undefined) await this.lane(tournamentId, () => this.step(tournamentId))
  }

  /**
   * An organizer starts a tournament that has no start time: the check-in window opens now and the
   * bracket is drawn when it closes (straight away without one).
   */
  async organizerStart(tournamentId: string): Promise<StartOutcome> {
    return this.lane(tournamentId, async () => {
      const t = await getTournamentRow(this.deps.db, tournamentId)
      if (!t || t.status !== 'open' || t.starts_at !== null || t.access === 'in_person') return 'not_startable'
      const startsAt = new Date(this.now() + (t.settings.checkInMinutes ?? 0) * 60_000)
      if (!(await setStartTime(this.deps.db, t.id, startsAt))) return 'not_startable'
      await this.schedule(t.id)
      return 'started'
    })
  }

  /**
   * An entry withdrew from a running tournament (Q12; a player, or a team's captain): its game, if
   * one is on, is aborted, and every match it had left goes to the other side.
   */
  async withdrawn(tournamentId: string, entryId: string): Promise<void> {
    const live = (await listMatches(this.deps.db, tournamentId)).find(r => r.status === 'live' && involves(r, entryId))
    const game = live && (await latestGame(this.deps.db, live.id))
    // Outside the lane: the abort's end hook queues the step that hands the match over
    if (game?.status === 'active') await this.deps.engine.deleteSession(game.id)
    await this.lane(tournamentId, () => this.step(tournamentId))
  }

  // ---- check-in and start ----------------------------------------------------------------

  private async schedule(tournamentId: string): Promise<void> {
    const t = await getTournamentRow(this.deps.db, tournamentId)
    if (!t?.starts_at || t.access === 'in_person' || (t.status !== 'open' && t.status !== 'check_in')) return
    const now = this.now()
    // Registration closed: a team still waiting for a player's confirmation loses its held spot
    if (!registrationOpen({ status: t.status, startsAt: t.starts_at.toISOString(), settings: t.settings }, new Date(now)))
      await releaseUnconfirmed(this.deps.db, t.id)
    const startAt = t.starts_at.getTime()
    if (now >= startAt) return this.begin(t)
    const checkIn = t.settings.checkInMinutes
    if (t.status === 'open' && checkIn !== null && now >= startAt - checkIn * 60_000) {
      // An unlocked average limit is checked again: who no longer fits loses the spot. Before the
      // move, so a restart in between checks again (dropping twice changes nothing)
      await this.dropIneligible(t)
      if ((await moveTournament(this.deps.db, t.id, 'open_check_in')) === null) return
      for (const e of await listEntries(this.deps.db, t.id)) {
        if (e.status !== 'registered') continue
        for (const p of e.players) {
          if (p.userId !== null)
            this.deps.send(p.userId, {
              type: 'tournament.checkIn',
              tournamentId: t.id,
              tournamentName: t.name,
              closesAt: t.starts_at.toISOString(),
            })
        }
      }
    }
  }

  /** Withdraws the entries an unlocked average limit no longer lets in, and tells their players. */
  private async dropIneligible(t: TournamentRow): Promise<void> {
    for (const { userId, eligibility } of await dropIneligibleEntries(this.deps.db, t.id)) {
      if (eligibility.reason === null) continue
      this.deps.send(userId, {
        type: 'tournament.dropped',
        tournamentId: t.id,
        tournamentName: t.name,
        reason: eligibility.reason,
        average: eligibility.average,
      })
    }
  }

  // The start: who plays (after a check-in, only who checked in), seeded and drawn
  private async begin(t: TournamentRow): Promise<void> {
    // Without a check-in window, the start is where an unlocked average limit is checked again
    if (t.status === 'open') await this.dropIneligible(t)
    const entries = await listEntries(this.deps.db, t.id)
    const playing = entries.filter(e => e.status === 'checked_in' || (t.status === 'open' && e.status === 'registered'))
    const seeded = await this.seed(t, playing)
    let matches
    try {
      matches = drawFor(setupOf(t), seeded)
    } catch (err) {
      // Too few entries for the format: nobody can play it
      this.warn('tournament cancelled at its start', { tournamentId: t.id, entries: playing.length, error: String(err) })
      await moveTournament(this.deps.db, t.id, 'cancel')
      return
    }
    if (!(await writeDraw(this.deps.db, t.id, seeded, matches, new Date(this.now())))) return
    await this.step(t.id)
  }

  private async seed(t: TournamentRow, entries: RunEntry[]): Promise<string[]> {
    const seeding = this.seeding(t, entries)
    const ratings =
      seeding.by === 'rating'
        ? await matchRatings(
            this.deps.db,
            entries.flatMap(e => e.players.flatMap(p => p.userId ?? [])),
            t.team_size === 1 ? '1v1' : '2v2',
          )
        : new Map<string, MatchRating>()
    // A team is seeded by its players' mean rating
    const ratingOf = (e: RunEntry) => mean(e.players.flatMap(p => ratings.get(p.userId ?? '')?.rating ?? []))
    return seedEntries(
      entries.map(e => ({ id: e.id, rating: ratingOf(e) })),
      seeding,
    )
  }

  private seeding(t: TournamentRow, entries: RunEntry[]): Seeding {
    switch (t.settings.seeding) {
      case 'rating':
        return { by: 'rating' }
      case 'random':
        return { by: 'random', seed: Math.floor((this.deps.random?.() ?? Math.random()) * 2 ** 31) }
      case 'manual':
        // The organizer's seeds, then whoever has none in registration order
        return { by: 'manual', order: [...entries].sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity)).map(e => e.id) }
    }
  }

  // ---- the running bracket ---------------------------------------------------------------

  /** Moves the bracket on until nothing changes. */
  private async step(tournamentId: string): Promise<void> {
    while (await this.pass(tournamentId));
  }

  /** One sweep over the bracket; true when it changed a row, so the next sweep sees the new state. */
  private async pass(tournamentId: string): Promise<boolean> {
    const { db } = this.deps
    const t = await getTournamentRow(db, tournamentId)
    if (t?.status !== 'running') return false
    const [entries, rows] = await Promise.all([listEntries(db, t.id), listMatches(db, t.id)])
    const seeded = seededOf(entries)
    const bracket = bracketOf(t, seeded, rows)
    if (isComplete(bracket)) {
      await finishWithPlaces(db, t.id, finalPlaces(setupOf(t), seeded, bracket), new Date(this.now()))
      return false
    }
    let changed = false
    // Rows catch up with the bracket: sides now known, byes, matches it no longer plays
    for (const m of bracket) {
      const row = rows.find(r => samePlace(placeOf(r), m))
      if (row?.status !== 'pending') continue
      const [a, b] = m.sides.map(s => s.entry)
      if (row.entry_a_id !== a || row.entry_b_id !== b) {
        await setSides(db, row.id, a, b)
        changed = true
      }
      if (m.result?.outcome === 'bye') {
        const winnerEntryId = m.sides[m.result.winner].entry
        changed = (await this.move(row.id, { event: 'bye', winnerEntryId, legsA: 0, legsB: 0 })) !== null || changed
      } else if (a !== null && b !== null) {
        changed = (await this.move(row.id, { event: 'seat' })) !== null || changed
      }
    }
    const gone = rows.filter(r => !bracket.some(m => samePlace(placeOf(r), m))).map(r => r.id)
    await deleteMatches(db, gone)
    if (changed || gone.length > 0) return true
    for (const row of rows.filter(r => r.status === 'live')) changed = (await this.settleLive(row, entries)) || changed
    if (changed) return true
    for (const row of rows.filter(r => r.status === 'ready').sort(before))
      changed = (await this.settleReady(t, row, entries, rows)) || changed
    return changed
  }

  /**
   * A live match whose game ended: its result. A game a player ended (its host may) is lost by
   * them; one ended by nobody in it (a withdrawal, a moderator, a failed start) is played again.
   */
  private async settleLive(row: TournamentMatchRow, entries: RunEntry[]): Promise<boolean> {
    const { db } = this.deps
    const game = await latestGame(db, row.id)
    if (game?.status === 'active') return false
    const quitter = sidesOf(row).findIndex(id => {
      const entry = entries.find(e => e.id === id)
      return entry !== undefined && entry.players.some(p => p.userId !== null && p.userId === game?.aborted_by_user_id)
    })
    if (quitter === 0 || quitter === 1)
      return (await this.move(row.id, { event: 'walkover', winnerEntryId: sidesOf(row)[1 - quitter], legsA: 0, legsB: 0 })) !== null
    const seats = game?.status === 'finished' ? await seatResults(db, game.id) : []
    // A team's seats share its legs and place
    const won = seats.findIndex(s => s.placement === 1)
    if (won === -1) return (await this.move(row.id, { event: 'abort' })) !== null
    const winner = sideOfSeat(won, seats.length)
    const [legsA, legsB] = [seats[0].legsWon, seats[seats.length - 1].legsWon]
    const done = Math.max(legsA, legsB) === row.first_to
    // A forfeit ends the game before anyone reached first-to: the match is a walkover
    return (await this.move(row.id, { event: done ? 'finish' : 'walkover', winnerEntryId: sidesOf(row)[winner], legsA, legsB })) !== null
  }

  /**
   * A ready match whose two players are both up for it: neither busy with an earlier match of
   * theirs. It starts once both are online and free; whoever is not after the no-show wait loses.
   */
  private async settleReady(t: TournamentRow, row: TournamentMatchRow, entries: RunEntry[], rows: TournamentMatchRow[]): Promise<boolean> {
    const sides = sidesOf(row).map(id => entries.find(e => e.id === id))
    const [a, b] = sides
    if (!a || !b) return false
    const walkover = (winner: 0 | 1) =>
      this.move(row.id, { event: 'walkover', winnerEntryId: sides[winner]?.id ?? null, legsA: 0, legsB: 0 }).then(to => to !== null)
    if (a.status === 'withdrawn' || b.status === 'withdrawn') return walkover(a.status === 'withdrawn' ? 1 : 0)
    const others = rows.filter(r => r.id !== row.id && (involves(r, a.id) || involves(r, b.id)))
    if (others.some(r => r.status === 'live' || (r.status === 'ready' && before(r, row) < 0))) return false
    const free = [a, b].map(e => {
      const players = playersOf(e)
      return players !== null && players.every(p => this.deps.isOnline(p.userId) && !this.deps.engine.getSessionByUser(p.userId))
    })
    if (free[0] && free[1]) return this.startGame(t, row, [a, b])
    // The wait runs from when both were done with their previous match
    const since = Math.max(row.ready_at?.getTime() ?? 0, ...others.map(r => r.finished_at?.getTime() ?? 0))
    // No wait set: the organizer turned no-show forfeits off, the match waits for both
    const wait = t.settings.noShowMinutes
    if (wait === null || this.now() - since < wait * 60_000) return false
    // Nobody showed: the better seed (side a) goes through
    return walkover(free[1] && !free[0] ? 1 : 0)
  }

  private async startGame(t: TournamentRow, row: TournamentMatchRow, sides: [RunEntry, RunEntry]): Promise<boolean> {
    const { db, engine } = this.deps
    const mod = games[t.game_id]
    const [pa, pb] = sides.map(playersOf)
    if (!mod || pa === null || pb === null || pa.length !== pb.length) return false
    const seated = [...pa, ...pb]
    const sideOf = (seat: number) => sideOfSeat(seat, seated.length)
    // Teams: side a is team 0, side b team 1, taking turns visit by visit (alternate visits)
    const teams =
      pa.length === 1
        ? { format: 'singles' }
        : { format: 'teams', teams: seated.map((_, seat) => sideOf(seat)), teamNames: sides.map(e => e.name) }
    const seats = await ownBoardSeats(db, seated, id => engine.getSessionByBoard(id) !== undefined)
    // Live before the game exists: a restart in between finds a live match without a game and puts it back
    if ((await this.move(row.id, { event: 'start' })) === null) return false
    let sessionId: string
    try {
      ;({ sessionId } = await engine.createWithSeats({
        ownerUserId: seated[0].userId,
        gameId: t.game_id,
        // Online: a bull off decides who starts, thrown again on a tie (like ranked)
        config: { ...mod.defaultConfig, ...t.game_config, firstTo: row.first_to, ...teams, bullOff: 'pdc' },
        seats,
        tournamentMatchId: row.id,
        lobbyName: t.name,
      }))
    } catch (err) {
      // Someone started another game meanwhile: tried again next time
      this.warn('tournament game did not start', { matchId: row.id, error: String(err) })
      await this.move(row.id, { event: 'abort' })
      return false
    }
    await linkSeats(
      db,
      sessionId,
      seated.map(p => p.id),
    )
    for (const [seat, p] of seated.entries())
      this.deps.send(p.userId, {
        type: 'tournament.match',
        tournamentId: t.id,
        tournamentName: t.name,
        sessionId,
        opponent: sides[1 - sideOf(seat)].name,
      })
    return true
  }
}
