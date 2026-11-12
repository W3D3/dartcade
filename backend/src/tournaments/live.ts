// The live tournament page's state (schema/tournament-ws-v1.json): the entries, the bracket's
// matches with the live games' legs, the tables and the schedule, pushed on /ws/tournament.
import type { Kysely } from 'kysely'
import type { WebSocket } from 'ws'
import type { Database } from '../db/schema.js'
import type { TournamentRow } from '../db/tournaments.js'
import { getTournamentRow, latestGame, legsWon, listEntries, listMatches } from '../db/tournamentRun.js'
import { getAvatars } from '../db/users.js'
import { currentSeat } from '../session/access.js'
import type { SessionEngine } from '../session/engine.js'
import type { Session } from '../session/types.js'
import type { TournamentLiveMatch, TournamentLiveMessage, TournamentLiveTable } from '../schema/tournament-ws.js'
import { snakeGroups, standings, type Match } from '../shared/tournaments/bracket.js'
import { samePlace } from '../shared/tournaments/run.js'
import { schedule, type MatchTimes } from '../shared/tournaments/schedule.js'
import { isOpen } from '../util/socket.js'
import { bracketOf, placeOf, seededOf } from './bracketRows.js'

/** How often every watched tournament is rebuilt; only a changed state is sent. */
const REFRESH_MS = 3_000

type Engine = Pick<SessionEngine, 'getSession'>

/** Legs each side has won so far, from the game's own summary (X01 and Cricket count them). */
function liveLegs(session: Session): [number, number] {
  const seats = session.module.summarize(session.currentState, { totalDarts: session.totalDarts, totalVisits: session.totalVisits })
  const legs = seats.map(s => legsWon(s.stats))
  return [legs[0] ?? 0, legs[1] ?? 0]
}

const asSide = (seat: number): 0 | 1 | null => (seat === 0 || seat === 1 ? seat : null)

function tablesOf(t: TournamentRow, seeded: string[], bracket: Match[]): TournamentLiveTable[] {
  const rows = (ms: Match[], entries: string[]) => standings(ms, entries).map(({ entry, ...s }) => ({ entryId: entry, ...s }))
  if (t.format === 'round_robin') return [{ group: null, rows: rows(bracket, seeded) }]
  if (t.format !== 'groups_knockout' || !t.settings.groups) return []
  return snakeGroups(seeded, t.settings.groups.size).map((entries, i) => ({
    group: i + 1,
    rows: rows(
      bracket.filter(m => m.group === i + 1),
      entries,
    ),
  }))
}

/** The tournament's live state, or null when it does not exist. */
export async function liveMessage(
  db: Kysely<Database>,
  engine: Engine,
  tournamentId: string,
  now: number,
): Promise<TournamentLiveMessage | null> {
  const t = await getTournamentRow(db, tournamentId)
  if (!t) return null
  const [entries, rows] = await Promise.all([listEntries(db, t.id), listMatches(db, t.id)])
  const avatars = await getAvatars(
    db,
    entries.flatMap(e => e.players.flatMap(p => p.userId ?? [])),
  )
  const seeded = seededOf(entries)
  const bracket = rows.length > 0 ? bracketOf(t, seeded, rows) : []
  // Every stored row is a match of the bracket (the runner drops those it no longer plays)
  const played = bracket.flatMap(m => rows.filter(r => samePlace(m, placeOf(r))).map(r => ({ m, r })))

  const matches = await Promise.all(
    played.map(async ({ m, r }): Promise<TournamentLiveMatch> => {
      const game = r.status === 'live' ? await latestGame(db, r.id) : undefined
      const session = game?.status === 'active' ? engine.getSession(game.id) : undefined
      const winner = r.winner_entry_id === null ? null : r.winner_entry_id === r.entry_a_id ? 0 : 1
      return {
        key: m.key,
        bracket: m.bracket,
        group: m.group,
        round: m.round,
        index: m.index,
        firstTo: r.first_to,
        status: r.status,
        sides: [r.entry_a_id, r.entry_b_id],
        outcome: r.outcome,
        winner,
        legs: session ? liveLegs(session) : [r.legs_a, r.legs_b],
        game: session ? { sessionId: session.id, throwing: asSide(currentSeat(session)) } : null,
      }
    }),
  )
  const times = new Map<string, MatchTimes>(
    played.map(({ m, r }) => [
      m.key,
      { status: r.status, startedAt: r.started_at?.getTime() ?? null, finishedAt: r.finished_at?.getTime() ?? null },
    ]),
  )
  // The planned start (an organizer start sets it too), not started_at: that is the database's clock, not `now`'s
  const startsAt = t.starts_at?.getTime() ?? now
  return {
    type: 'tournament.live',
    tournamentId: t.id,
    status: t.status,
    entries: entries.map(e => ({
      id: e.id,
      name: e.name,
      status: e.status,
      seed: e.seed,
      finalPlace: e.final_place,
      players: e.players.map(p => ({
        userId: p.userId,
        name: p.name,
        avatar: (p.userId !== null && avatars.get(p.userId)) || { kind: 'none' },
      })),
    })),
    matches,
    tables: tablesOf(t, seeded, bracket),
    schedule: schedule(t.format, bracket, times, startsAt, now).map(s => ({
      bracket: s.bracket,
      round: s.round,
      name: s.name,
      state: s.state,
      at: s.at === null ? null : new Date(s.at).toISOString(),
    })),
  }
}

/**
 * The open /ws/tournament sockets per tournament. Each watched tournament is rebuilt every few
 * seconds and sent only when it changed, so the bracket, the live legs and the schedule follow
 * the games without the runner telling anyone.
 * shortcut: polls the DB per watched tournament, fine at today's handful; hook the runner's changes in if that grows.
 */
export class TournamentLive {
  private readonly sockets = new Map<string, Set<WebSocket>>()
  private readonly last = new Map<string, string>()
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly build: (tournamentId: string) => Promise<TournamentLiveMessage | null>,
    private readonly warn: (message: string, details: unknown) => void = () => {},
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      this.refreshAll().catch((err: unknown) => {
        this.warn('tournament live refresh failed', { error: String(err) })
      })
    }, REFRESH_MS)
    this.timer.unref()
  }

  close(): void {
    clearInterval(this.timer)
  }

  socketCount(): number {
    return [...this.sockets.values()].reduce((n, s) => n + s.size, 0)
  }

  /** A socket opened: it gets the state straight away. */
  async add(tournamentId: string, ws: WebSocket): Promise<void> {
    const open = this.sockets.get(tournamentId) ?? new Set()
    open.add(ws)
    this.sockets.set(tournamentId, open)
    const payload = this.last.get(tournamentId) ?? (await this.rebuild(tournamentId))
    if (payload !== null && isOpen(ws)) ws.send(payload)
  }

  remove(tournamentId: string, ws: WebSocket): void {
    const open = this.sockets.get(tournamentId)
    open?.delete(ws)
    if (open?.size === 0) {
      this.sockets.delete(tournamentId)
      this.last.delete(tournamentId)
    }
  }

  /** Rebuilds the tournament's state and sends it to its sockets if it changed. */
  async refresh(tournamentId: string): Promise<void> {
    const previous = this.last.get(tournamentId)
    const payload = await this.rebuild(tournamentId)
    if (payload === null || payload === previous) return
    for (const ws of this.sockets.get(tournamentId) ?? []) if (isOpen(ws)) ws.send(payload)
  }

  async refreshAll(): Promise<void> {
    for (const id of [...this.sockets.keys()]) await this.refresh(id)
  }

  private async rebuild(tournamentId: string): Promise<string | null> {
    const msg = await this.build(tournamentId)
    if (msg === null) return null
    const payload = JSON.stringify(msg)
    // Only while someone watches: a socket that closed meanwhile leaves nothing behind
    if (this.sockets.has(tournamentId)) this.last.set(tournamentId, payload)
    return payload
  }
}
