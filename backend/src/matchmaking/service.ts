import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { getAccountsByIds, type Avatar } from '../db/users.js'
import { getOpenLobbyIdOfUser, loadLobby, usualBoards } from '../db/lobbies.js'
import { insertRankedMatch, matchRatings, recordRankedGame, unrecordedRankedGames } from '../db/ranked.js'
import type { GameEnded, SessionEngine } from '../session/engine.js'
import { ActiveSessionError } from '../session/errors.js'
import type { Seat } from '../session/types.js'
import type { MatchmakingMessage } from '../schema/lobby-ws.js'
import { ApiError } from '../api/errors.js'
import { ACCEPT_SECONDS, sideRating, stakes, type RankedMode } from '../shared/ranked.js'
import { KeyedQueue } from '../util/keyedQueue.js'
import { findMatches, matchFirstTo, rangeOf, type Entry, type FirstTo } from './matcher.js'

/** How long everyone has to accept a found match. */
export const ACCEPT_MS = ACCEPT_SECONDS * 1000
/** How long declining (or letting the time run out) keeps you from searching again. */
export const PAUSE_MS = 2 * 60_000
/** How often the queue looks for matches and drops the ones nobody accepted in time. */
export const TICK_MS = 1_000

type ConflictCode = 'searching' | 'paused' | 'active_session' | 'not_duo'

/** A refused matchmaking request (RankedConflict in schema/api-v1.yaml). */
export class MatchmakingError extends ApiError {
  static conflict(code: ConflictCode, error: string): MatchmakingError {
    return new MatchmakingError(409, { error, code })
  }
  static forbidden(error: string): MatchmakingError {
    return new MatchmakingError(403, { error })
  }
  static notFound(error: string): MatchmakingError {
    return new MatchmakingError(404, { error })
  }
}

type Player = { userId: string; name: string; avatar: Avatar; rating: number; placing: boolean }
/** A search: the matcher's entry, with who is in it. */
type Search = Entry & { players: Player[] }
/** A match the queue found, waiting for everyone to accept. */
type Found = {
  id: string
  sides: [Search, Search]
  firstTo: FirstTo
  /** The narrower of the two sides' ranges when they were paired: the other side is within it. */
  range: number
  accepted: Set<string>
  expiresAt: number
}

export type MatchmakingDeps = {
  db: Kysely<Database>
  engine: Pick<SessionEngine, 'getSessionByUser' | 'getSessionByBoard' | 'createWithSeats'>
  /** Sends a user's /ws/me their search (LobbyHub.sendMatchmaking). */
  send: (userId: string, msg: MatchmakingMessage) => void
  now?: () => number
  warn?: (message: string, details: unknown) => void
}

const userIdsOf = (s: Search): string[] => s.players.map(p => p.userId)

/** The game a match plays: X01 501, double out, first to 2 or 3 legs, a bull off decides who starts. */
export function rankedConfig(mode: RankedMode, firstTo: FirstTo): Record<string, unknown> {
  return {
    startScore: 501,
    inMode: 'straight',
    outMode: 'double',
    // PDC: nobody measures a bull's distance, so a tie is thrown again (works on manual entry too)
    bullOff: 'pdc',
    bullValue: '25_50',
    maxRounds: 50,
    firstTo,
    botSpeed: 'normal',
    ...(mode === '2v2' ? { format: 'teams', teams: [0, 0, 1, 1] } : { format: 'singles' }),
  }
}

/**
 * The ranked queue (design: docs/superpowers/specs/2026-10-14-matchmaking-design.md). Searches live
 * in memory, so a restart drops them; the games they start and their ratings are in the database.
 * Every change runs one after another on one queue. Each user's /ws/me gets their search after
 * every change that concerns them.
 */
export class MatchmakingService {
  private readonly queue = new KeyedQueue()
  /** Running searches, by id; a search in a found match is in `found` instead. */
  private readonly searches = new Map<string, Search>()
  private readonly found = new Map<string, Found>()
  /** Users who declined or missed a match: no new search until then (ms). */
  private readonly pausedUntil = new Map<string, number>()
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly deps: MatchmakingDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private warn(message: string, details: unknown = {}): void {
    if (this.deps.warn) this.deps.warn(message, details)
    else console.warn(message, details)
  }

  // Some changes don't touch the database: they run in the queue all the same
  private run<T>(task: () => T | Promise<T>): Promise<T> {
    return this.queue.run('queue', async () => task())
  }

  /** Looks for matches every TICK_MS until close(). */
  start(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => {
        this.warn('matchmaking tick failed', { error: String(err) })
      })
    }, TICK_MS)
    this.timer.unref()
  }

  close(): void {
    clearInterval(this.timer)
  }

  // ---- what /ws/me shows ---------------------------------------------------------------

  private searchOf(userId: string): Search | undefined {
    for (const s of this.searches.values()) if (userIdsOf(s).includes(userId)) return s
    return undefined
  }

  private foundOf(userId: string): Found | undefined {
    for (const f of this.found.values()) if (f.sides.some(s => userIdsOf(s).includes(userId))) return f
    return undefined
  }

  private paused(userId: string): number | null {
    const until = this.pausedUntil.get(userId)
    if (until === undefined) return null
    if (until > this.now()) return until
    this.pausedUntil.delete(userId)
    return null
  }

  /** The user's search as /ws/me shows it. */
  message(userId: string): MatchmakingMessage {
    const now = this.now()
    const paused = this.paused(userId)
    const msg: MatchmakingMessage = {
      type: 'matchmaking',
      search: null,
      match: null,
      pausedUntil: paused === null ? null : new Date(paused).toISOString(),
    }
    const search = this.searchOf(userId)
    if (search) {
      const placing = search.players.some(p => p.placing)
      msg.search = {
        mode: search.mode,
        firstTo: search.firstTo,
        since: new Date(search.since).toISOString(),
        range: rangeOf(search, now),
        rating: placing ? null : search.rating,
        hostUserId: search.userIds[0],
        players: search.players.map(p => p.name),
        searching: [...this.searches.values()].filter(s => s.mode === search.mode).length,
      }
    }
    const found = this.foundOf(userId)
    if (found) {
      const mine = found.sides.findIndex(s => userIdsOf(s).includes(userId))
      const [own, other] = [found.sides[mine], found.sides[1 - mine]]
      const me = own.players.find(p => p.userId === userId)
      msg.match = {
        id: found.id,
        mode: own.mode,
        firstTo: found.firstTo,
        expiresAt: new Date(found.expiresAt).toISOString(),
        range: found.range,
        stakes: me === undefined || me.placing ? null : stakes(own.rating, other.rating),
        yours: own.players.map(p => ({
          person: { userId: p.userId, name: p.name, guest: false, avatar: p.avatar },
          accepted: found.accepted.has(p.userId),
          you: p.userId === userId,
        })),
        theirs: other.players.map(p => ({
          person: null,
          accepted: found.accepted.has(p.userId),
          you: false,
        })),
      }
    }
    return msg
  }

  private push(userIds: Iterable<string>): void {
    for (const u of new Set(userIds)) this.deps.send(u, this.message(u))
  }

  // ---- searching -----------------------------------------------------------------------

  /** Starts a search: alone (1v1), or for the user's lobby of two, as its host (2v2). */
  async search(userId: string, req: { mode: RankedMode; firstTo: FirstTo }): Promise<void> {
    await this.run(async () => {
      this.assertFree(userId, true)
      const userIds = req.mode === '1v1' ? [userId] : await this.duoOf(userId)
      for (const u of userIds) this.assertFree(u, u === userId)
      const [ratings, users] = await Promise.all([matchRatings(this.deps.db, userIds, req.mode), getAccountsByIds(this.deps.db, userIds)])
      const players = userIds.map(u => {
        const r = ratings.get(u)
        if (!r) throw new Error(`no rating for ${u}`)
        const account = users.find(x => x.id === u)
        return { userId: u, name: account?.name ?? '', avatar: account?.avatar ?? { kind: 'none' as const }, ...r }
      })
      // Checked again: someone may have started searching or playing while the ratings loaded
      for (const u of userIds) this.assertFree(u, u === userId)
      const search: Search = {
        id: ulid(),
        mode: req.mode,
        userIds,
        rating: sideRating(players.map(p => p.rating)),
        firstTo: req.firstTo,
        since: this.now(),
        players,
      }
      this.searches.set(search.id, search)
      this.push([...userIds, ...this.searchersOf(req.mode)])
    })
  }

  // A 2v2 search: the host of an open lobby of exactly two members, host first
  private async duoOf(userId: string): Promise<string[]> {
    const lobbyId = await getOpenLobbyIdOfUser(this.deps.db, userId)
    const lobby = lobbyId === undefined ? undefined : await loadLobby(this.deps.db, lobbyId)
    const notDuo = MatchmakingError.conflict('not_duo', 'For 2v2, open a lobby with your partner: just the two of you, you as host')
    if (!lobby || lobby.closedAt !== null || lobby.hostUserId !== userId || lobby.people.length !== 2) throw notDuo
    const partner = lobby.people.find(p => p.userId !== userId)?.userId
    if (partner === undefined || partner === null) throw notDuo
    return [userId, partner]
  }

  // Whether the user may start (or be part of) a new search; `self`: they asked for it themselves
  private assertFree(userId: string, self: boolean): void {
    const who = self ? 'You are' : 'Your partner is'
    if (this.searchOf(userId) ?? this.foundOf(userId)) throw MatchmakingError.conflict('searching', `${who} searching already`)
    if (this.paused(userId) !== null) throw MatchmakingError.conflict('paused', `${who} paused for a moment after a declined match`)
    if (this.deps.engine.getSessionByUser(userId)) throw MatchmakingError.conflict('active_session', `${who} in a game`)
  }

  private searchersOf(mode: RankedMode): string[] {
    return [...this.searches.values()].filter(s => s.mode === mode).flatMap(userIdsOf)
  }

  /** Stops the user's search; a duo's only by its host. In a found match it counts as declining. */
  async cancel(userId: string): Promise<void> {
    await this.run(() => {
      const found = this.foundOf(userId)
      if (found) {
        this.drop(found, [userId])
        return
      }
      const search = this.searchOf(userId)
      if (!search) return
      if (search.userIds[0] !== userId) throw MatchmakingError.forbidden("Only your duo's host can cancel the search")
      this.searches.delete(search.id)
      this.push([...search.userIds, ...this.searchersOf(search.mode)])
    })
  }

  // ---- found matches -------------------------------------------------------------------

  async accept(userId: string, matchId: string): Promise<void> {
    await this.run(async () => {
      const found = this.found.get(matchId)
      if (!found || !found.sides.some(s => userIdsOf(s).includes(userId))) throw MatchmakingError.notFound('match not found')
      found.accepted.add(userId)
      const everyone = found.sides.flatMap(userIdsOf)
      if (everyone.every(u => found.accepted.has(u))) await this.startGame(found)
      else this.push(everyone)
    })
  }

  async decline(userId: string, matchId: string): Promise<void> {
    await this.run(() => {
      const found = this.found.get(matchId)
      if (!found || !found.sides.some(s => userIdsOf(s).includes(userId))) throw MatchmakingError.notFound('match not found')
      this.drop(found, [userId])
    })
  }

  /**
   * A match falls through: the searches of whoever declined (or didn't accept in time) end and
   * they pause for PAUSE_MS; the other searches go back to the queue with their place kept.
   * Without `pause`, the ones in `out` just stop searching (they started a game meanwhile).
   */
  private drop(found: Found, out: string[], pause = true): void {
    this.found.delete(found.id)
    const until = this.now() + PAUSE_MS
    if (pause) for (const u of out) this.pausedUntil.set(u, until)
    for (const side of found.sides) {
      if (!userIdsOf(side).some(u => out.includes(u))) this.searches.set(side.id, side)
    }
    this.push([...found.sides.flatMap(userIdsOf), ...this.searchersOf(found.sides[0].mode)])
  }

  /** Drops matches nobody accepted in time, then pairs the searches it can. */
  async tick(): Promise<void> {
    await this.run(() => {
      const now = this.now()
      for (const f of [...this.found.values()]) {
        if (f.expiresAt <= now)
          this.drop(
            f,
            f.sides.flatMap(userIdsOf).filter(u => !f.accepted.has(u)),
          )
      }
      // A game started some other way (a lobby game) ends the search
      for (const s of [...this.searches.values()]) {
        if (s.userIds.some(u => this.deps.engine.getSessionByUser(u))) {
          this.searches.delete(s.id)
          this.push([...s.userIds, ...this.searchersOf(s.mode)])
        }
      }
      for (const [a, b] of findMatches([...this.searches.values()], now)) {
        this.searches.delete(a.id)
        this.searches.delete(b.id)
        const found: Found = {
          id: ulid(),
          sides: [a, b],
          firstTo: matchFirstTo(a, b),
          range: Math.min(rangeOf(a, now), rangeOf(b, now)),
          accepted: new Set(),
          expiresAt: now + ACCEPT_MS,
        }
        this.found.set(found.id, found)
        this.push([...userIdsOf(a), ...userIdsOf(b), ...this.searchersOf(a.mode)])
      }
      // The ranges widen as time passes
      this.push([...this.searches.values()].flatMap(userIdsOf))
    })
  }

  // ---- starting the game ---------------------------------------------------------------

  // Everyone accepted: the game starts on everyone's own board (their lobby seat's, else their
  // usual one; manual entry without one, or when it's in another game)
  private async startGame(found: Found): Promise<void> {
    this.found.delete(found.id)
    const [a, b] = found.sides
    const mode = a.mode
    const seats = await this.seatsOf([...a.players, ...b.players])
    let sessionId: string
    try {
      ;({ sessionId } = await this.deps.engine.createWithSeats({
        ownerUserId: a.userIds[0],
        gameId: 'x01',
        config: rankedConfig(mode, found.firstTo),
        seats,
        lobbyName: `Ranked ${mode}`,
      }))
    } catch (err) {
      // Someone started another game meanwhile: their side stops searching, the other goes back
      const busy = err instanceof ActiveSessionError ? [err.userId] : []
      if (busy.length === 0) this.warn('ranked game failed to start', { matchId: found.id, error: String(err) })
      this.drop(found, busy, false)
      return
    }
    try {
      await insertRankedMatch(this.deps.db, { sessionId, mode, sides: [a.userIds, b.userIds] })
    } catch (err) {
      this.warn('ranked match not stored: its ratings will not move', { sessionId, error: String(err) })
    }
    this.push([...a.userIds, ...b.userIds, ...this.searchersOf(mode)])
  }

  private async seatsOf(players: Player[]): Promise<Seat[]> {
    const usual = await usualBoards(
      this.deps.db,
      players.map(p => p.userId),
    )
    const seats: Seat[] = []
    for (const p of players) {
      const lobbyId = await getOpenLobbyIdOfUser(this.deps.db, p.userId)
      const person = lobbyId === undefined ? undefined : (await loadLobby(this.deps.db, lobbyId))?.people.find(x => x.userId === p.userId)
      const board =
        person === undefined
          ? (usual.get(p.userId) ?? null)
          : person.boardId === null
            ? null
            : { id: person.boardId, name: person.boardName ?? '' }
      const free = board !== null && !this.deps.engine.getSessionByBoard(board.id) && !seats.some(s => s.boardId === board.id)
      seats.push({
        name: p.name,
        userId: p.userId,
        controllerUserId: p.userId,
        boardId: free ? board.id : null,
        boardName: free ? board.name : null,
        bot: null,
      })
    }
    return seats
  }

  // ---- results -------------------------------------------------------------------------

  /** The engine's `ended` hook: a ranked game that finished moves its players' ratings. */
  async onGameEnded(e: GameEnded): Promise<void> {
    if (e.status !== 'finished' || e.gameId !== 'x01') return
    try {
      await recordRankedGame(this.deps.db, e.sessionId)
    } catch (err) {
      this.warn('ranked result not recorded', { sessionId: e.sessionId, error: String(err) })
    }
  }

  /** At start-up: ranked games that finished while the server was down move their ratings now. */
  async settleAll(): Promise<void> {
    for (const sessionId of await unrecordedRankedGames(this.deps.db)) await recordRankedGame(this.deps.db, sessionId)
  }
}
