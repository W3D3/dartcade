import { ulid } from 'ulid'
import { games } from '../games/index.js'
import { applyInput, awaitsFinish, type GameInput } from './apply.js'
import type { GameConfig, Session, Player, Seat, FinishedSeat, UserAction, Snapshot } from './types.js'
import { parseBoardEvent, readBoardStatus } from './boardEvent.js'
import { authorizeAction, currentSeat } from './access.js'
import { newSeed, seededRng, shuffle } from './rng.js'
import { StoredConfigSchema, dartRows, newSession, replay, results, type WarnFn } from './replay.js'
import type { Kysely } from 'kysely'
import { KeyedQueue } from '../util/keyedQueue.js'
import { ActiveSessionError, BoardBusyError, InvalidConfigError, UnknownGameError } from './errors.js'
import type { Database } from '../db/schema.js'
import * as queries from '../db/queries.js'
import type { NewGameDart, NewGameSession, NewSessionEvent, StoredGameSession, StoredSessionEvent } from '../db/queries.js'

type PushFn = (sessionId: string) => void

export type Notice = { type: 'notice'; code: 'not_your_turn'; boardId: string; throwerName: string; throwerBoard: string | null }
export type NotifyFn = (sessionId: string, userIds: string[], notice: Notice) => void

export type ActionResult = { ok: true } | { ok: false; code: 'forbidden' }

/** Board events that would end or add to the visit that wins the game (see awaitsFinish). */
const HELD = new Set(['visit.opened', 'dart.detected', 'takeout.finished', 'visit.cleared'])

/** A game ended: the lobby it came from resets and logs it (see LobbyService.onGameEnded). */
export type GameEnded = {
  sessionId: string
  lobbyId: string | null
  gameId: string
  status: 'finished' | 'aborted'
  abortedByUserId: string | null
  /** Seat results in seat order; empty when aborted. */
  results: { name: string; placement: number; forfeited: boolean }[]
  /** Played in teams (some team has more than one seat): every seat placed 1st won. */
  teamGame: boolean
  /** Every account seated (owner and every seat's controller): who to push /ws/me to. */
  userIds: string[]
}
export type EndedFn = (e: GameEnded) => void | Promise<void>

/** How long a won game stays after it ends, so late watchers still get its final snapshot. */
export const KEEP_FINISHED_MS = 10 * 60_000

export type EngineOptions = {
  /** How long a won game stays after it ends (default KEEP_FINISHED_MS). */
  keepFinishedMs?: number
  /** A game is gone from the engine (aborted, or a won game's keepFinishedMs passed). */
  forgotten?: (sessionId: string) => void
}

/** A game started: who to push /ws/me to (see LobbyService.onGameStarted). */
export type GameStarted = { sessionId: string; userIds: string[] }
export type StartedFn = (e: GameStarted) => void | Promise<void>

/**
 * Who is looking: the viewer's own seats, who has the game open (and since when not),
 * which boards are online.
 */
export type SnapshotView = {
  viewerUserId: string | null
  connectedUserIds: ReadonlySet<string>
  /** When the user's last socket of the game closed; null if open or never opened. */
  disconnectedAt: (userId: string) => Date | null
  isBoardOnline: (boardId: string) => boolean
}
const NO_VIEWER: SnapshotView = { viewerUserId: null, connectedUserIds: new Set(), disconnectedAt: () => null, isBoardOnline: () => false }

// Where an input came from: the bridge event it was, and the board it was thrown on
type Origin = { bridgeEventId: string | null; boardId: string | null }

export interface EngineStore {
  insertSession(data: NewGameSession): Promise<void>
  getActiveSessions(): Promise<StoredGameSession[]>
  getSessionEvents(sessionId: string): Promise<StoredSessionEvent[]>
  appendEvent(event: NewSessionEvent): Promise<void>
  insertDarts(rows: NewGameDart[]): Promise<void>
  deleteDarts(sessionId: string, visit: number): Promise<void>
  finishSession(id: string, finishedAt: Date, results: FinishedSeat[]): Promise<void>
  abortSession(id: string, finishedAt: Date, abortedByUserId: string | null): Promise<void>
}

export function createEngineStore(db: Kysely<Database>): EngineStore {
  return {
    insertSession: d => queries.insertGameSession(db, d),
    getActiveSessions: () => queries.getActiveGameSessions(db),
    getSessionEvents: id => queries.getSessionEvents(db, id),
    appendEvent: e => queries.appendSessionEvent(db, e),
    insertDarts: rows => queries.insertGameDarts(db, rows),
    deleteDarts: (id, visit) => queries.deleteGameDarts(db, id, visit),
    finishSession: (id, at, r) => queries.finishGameSession(db, id, at, r),
    abortSession: (id, at, by) => queries.abortGameSession(db, id, at, by),
  }
}

export type NewSessionSpec = {
  ownerUserId: string
  gameId: string
  config: GameConfig
  seats: Seat[]
  /** A lobby game: its lobby and that lobby's name (for the match header). */
  lobbyId?: string | null
  lobbyName?: string | null
  /** Random throw order: the seats are shuffled with the game's seed before they're stored. */
  shuffleSeats?: boolean
}

const distinct = <T>(xs: (T | null)[]): T[] => [...new Set(xs.filter((x): x is T => x !== null))]
const seatBoards = (s: Session): string[] => distinct(s.seats.map(x => x.boardId))
const controllers = (s: Session): string[] => distinct(s.seats.map(x => x.controllerUserId))
// Every account seated: the owner and every seat's controller (a member always controls their
// own seat; only a guest's controller differs from them, and a guest has no account).
const seatedUserIds = (s: Session): string[] => distinct([s.ownerUserId, ...controllers(s)])
// Some team has more than one seat (without teams every seat is its own team)
const isTeamGame = (s: Session): boolean => {
  const teamOf = s.module.teamsOf?.(s.committedState) ?? []
  return new Set(teamOf).size < teamOf.length
}
const storedSeatedUserIds = (row: Pick<StoredGameSession, 'owner_user_id' | 'players'>): string[] =>
  distinct([row.owner_user_id, ...row.players.map(p => p.controller_user_id)])
// A stored game that couldn't be brought back ended aborted, by nobody, without results
const storedAborted = (row: StoredGameSession): GameEnded => ({
  sessionId: row.id,
  lobbyId: row.lobby_id,
  gameId: row.game_id,
  status: 'aborted',
  abortedByUserId: null,
  results: [],
  teamGame: false,
  userIds: storedSeatedUserIds(row),
})

/** The seats as one viewer sees them: boards online, controllers connected or since when not. */
function seatViews(session: Session, view: SnapshotView) {
  return session.seats.map((s, i) => {
    const connected = view.connectedUserIds.has(s.controllerUserId)
    return {
      controllerUserId: s.controllerUserId,
      userId: s.userId,
      boardId: s.boardId,
      boardName: s.boardName,
      boardOnline: s.boardId !== null && view.isBoardOnline(s.boardId),
      controllerConnected: connected,
      // Only a controller without the game open has a time; it says how long the game waits
      disconnectedAt: connected ? null : (view.disconnectedAt(s.controllerUserId)?.toISOString() ?? null),
      forfeited: session.forfeited.includes(i),
      bot: s.bot,
    }
  })
}

export class SessionEngine {
  private byBoard: Map<string, Session> = new Map()
  private byId: Map<string, Session> = new Map()
  private byUser: Map<string, Session> = new Map()
  // Running lobby games, by lobby
  private readonly byLobby = new Map<string, Session>()
  // Won games waiting to be forgotten
  private readonly evictions = new Map<string, ReturnType<typeof setTimeout>>()
  // Inputs of one session are logged and applied strictly one after another, so the
  // log's order is the order they were applied in
  private readonly queues = new KeyedQueue()

  constructor(
    private readonly store: EngineStore,
    private readonly push: PushFn,
    private readonly warn: WarnFn = () => undefined,
    private readonly notify: NotifyFn = () => undefined,
    private readonly ended: EndedFn = () => undefined,
    private readonly started: StartedFn = () => undefined,
    private readonly opts: EngineOptions = {},
  ) {}

  async create(
    ownerUserId: string,
    boardId: string | null,
    gameId: string,
    config: GameConfig,
    players: Player[],
    boardName: string | null = null,
  ): Promise<{ sessionId: string }> {
    // A local game: the owner throws for everyone, on one board; only the owner's seat is an account
    const seats = players.map((p, i): Seat => ({
      name: p.name,
      userId: i === 0 ? ownerUserId : null,
      controllerUserId: ownerUserId,
      boardId,
      boardName,
      bot: null,
    }))
    return this.start({ ownerUserId, gameId, config, seats }, boardId)
  }

  async createWithSeats(spec: NewSessionSpec): Promise<{ sessionId: string }> {
    return this.start(spec, null)
  }

  private async start(spec: NewSessionSpec, sessionBoardId: string | null): Promise<{ sessionId: string }> {
    const mod = games[spec.gameId]
    if (!mod) throw new UnknownGameError(spec.gameId)
    for (const userId of distinct([spec.ownerUserId, ...spec.seats.map(s => s.controllerUserId)])) {
      const running = this.byUser.get(userId)
      if (running) throw new ActiveSessionError('active session already exists for user', running.id, userId)
    }
    for (const boardId of distinct(spec.seats.map(s => s.boardId))) {
      if (this.byBoard.has(boardId)) throw new BoardBusyError(boardId)
    }
    const players = spec.seats.map(s => ({ name: s.name }))
    const invalid = mod.validate?.(spec.config, players)
    if (invalid) throw new InvalidConfigError(invalid)

    const sessionId = ulid()
    const seed = newSeed()
    // Stored in this order, so a replay needs no shuffle of its own
    const seats = spec.shuffleSeats === true ? shuffle(spec.seats, seededRng(seed)) : spec.seats
    const lobbyId = spec.lobbyId ?? null
    const session = newSession({
      id: sessionId,
      ownerUserId: spec.ownerUserId,
      boardId: sessionBoardId,
      module: mod,
      config: spec.config,
      seats,
      seed,
      createdAt: new Date(),
      lobbyId,
      lobbyName: spec.lobbyName ?? null,
    })
    // Claim the players and boards before the first await, so a second create running
    // at the same time sees them taken; give them back if the session can't be stored
    this.index(session)
    try {
      await this.store.insertSession({
        id: sessionId,
        owner_user_id: spec.ownerUserId,
        board_db_id: sessionBoardId,
        game_id: spec.gameId,
        game_version: mod.version,
        rng_seed: seed,
        config: spec.config,
        lobby_id: lobbyId,
        players: seats.map(s => ({
          name: s.name,
          user_id: s.userId,
          controller_user_id: s.controllerUserId,
          board_db_id: s.boardId,
          bot_level: s.bot?.level ?? null,
        })),
      })
    } catch (err) {
      this.release(session)
      this.forget(session)
      throw err
    }
    await this.notifyStarted({ sessionId, userIds: seatedUserIds(session) })
    return { sessionId }
  }

  private index(session: Session): void {
    for (const b of seatBoards(session)) this.byBoard.set(b, session)
    for (const u of distinct([session.ownerUserId, ...controllers(session)])) this.byUser.set(u, session)
    if (session.lobbyId !== null) this.byLobby.set(session.lobbyId, session)
    this.byId.set(session.id, session)
  }

  private enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    return this.queues.run(sessionId, task)
  }

  async onBridgeEvent(boardId: string, kind: string, data: unknown, bridgeEventId: string | null = null): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return
    const event = parseBoardEvent(kind, data)
    if (!event && (kind === 'dart.detected' || kind === 'dart.corrected')) {
      this.warn(`ignored ${kind} event: data does not match the bridge schema`, { boardId, data })
    }
    // board.status only feeds the status pill: kept per board, not logged
    let changed = false
    if (event?.kind === 'board.status') {
      session.boardStatus.set(boardId, readBoardStatus(event.data))
      changed = true
    } else if (event) {
      changed = await this.record(session, { source: 'board', event }, { kind, data }, { bridgeEventId, boardId })
    }
    // Dropped input (another board's turn, a game that's over) changes nothing to show
    if (changed) this.push(session.id)
  }

  /** A board's bridge connected or dropped: its game shows the new board state. */
  onBoardPresence(boardId: string): void {
    const session = this.byBoard.get(boardId)
    if (session) this.push(session.id)
  }

  async onUserAction(sessionId: string, userId: string, action: UserAction): Promise<ActionResult> {
    const session = this.byId.get(sessionId)
    if (!session) return { ok: true }
    const { result, changed } = await this.enqueue(session.id, async () => {
      // Decided inside the queue: whose turn it is can change with every input.
      // A game that's over takes no input anyway (apply drops it).
      const allowed = session.status === 'active' ? authorizeAction(session, userId, action) : action
      if (!allowed) return { result: { ok: false, code: 'forbidden' } satisfies ActionResult, changed: false }
      const applied = await this.apply(
        session,
        { source: 'user', action: allowed },
        { kind: allowed.type, data: allowed },
        { bridgeEventId: null, boardId: null },
      )
      return { result: { ok: true } satisfies ActionResult, changed: applied }
    })
    // A refused or dropped action changes nothing: no snapshot for everyone
    if (changed) this.push(session.id)
    return result
  }

  private record(session: Session, input: GameInput, raw: { kind: string; data: unknown }, origin: Origin): Promise<boolean> {
    return this.enqueue(session.id, () => this.apply(session, input, raw, origin))
  }

  // Runs inside the session's queue. Logs the input (raw, as received), then applies it and
  // stores what it committed. A board event from a board whose seat isn't up is dropped
  // before it's logged. True when the input was applied.
  private async apply(session: Session, input: GameInput, raw: { kind: string; data: unknown }, origin: Origin): Promise<boolean> {
    if (session.status !== 'active') return false
    if (origin.boardId !== null && session.seats[currentSeat(session)].boardId !== origin.boardId) {
      if (input.source === 'board' && input.event.kind === 'dart.detected') this.notifyNotYourTurn(session, origin.boardId)
      return false
    }
    // The visit that wins the game waits for Finish: the board can't end or add to it (dropped
    // before it's logged, so logs from before this rule replay as they were played)
    if (input.source === 'board' && HELD.has(input.event.kind) && awaitsFinish(session)) return false
    const at = new Date()
    await this.logInput(session, input, raw, origin, at)
    const outcome = applyInput(session, input, at)
    if (outcome.reopened !== undefined) await this.store.deleteDarts(session.id, outcome.reopened)
    if (outcome.committed) await this.store.insertDarts(dartRows(session.id, outcome.committed))
    // finish() pushes the final snapshot itself (before notifying), so the caller doesn't
    // push it a second time
    if (outcome.won) {
      await this.finish(session, at)
      return false
    }
    return true
  }

  // A dart on a board whose seat isn't up: whoever throws at that board hears whose turn it is
  private notifyNotYourTurn(session: Session, boardId: string): void {
    const up = session.seats[currentSeat(session)]
    const users = [...new Set(session.seats.filter(s => s.boardId === boardId).map(s => s.controllerUserId))]
    this.notify(session.id, users, {
      type: 'notice',
      code: 'not_your_turn',
      boardId,
      throwerName: up.name,
      // a board whose name is gone (deleted) is still a board, not hand entry
      throwerBoard: up.boardId === null ? null : (up.boardName ?? 'Board'),
    })
  }

  // Appends the input, as received, to the session's log
  private async logInput(
    session: Session,
    input: GameInput,
    raw: { kind: string; data: unknown },
    origin: Origin,
    at: Date,
  ): Promise<void> {
    await this.store.appendEvent({
      session_id: session.id,
      seq: session.nextSeq,
      source: input.source,
      kind: raw.kind,
      data: raw.data,
      bridge_event_id: origin.bridgeEventId,
      board_db_id: origin.boardId,
      created_at: at,
    })
    session.nextSeq++
  }

  /** The game-end listener must not undo the end: whatever it throws (or rejects with) is logged, never passed on. */
  private async notifyEnded(e: GameEnded): Promise<void> {
    try {
      await this.ended(e)
    } catch (err) {
      this.warn('game-end listener failed', { sessionId: e.sessionId, error: String(err) })
    }
  }

  /** Same contract as notifyEnded, for the game-start listener. */
  private async notifyStarted(e: GameStarted): Promise<void> {
    try {
      await this.started(e)
    } catch (err) {
      this.warn('game-start listener failed', { sessionId: e.sessionId, error: String(err) })
    }
  }

  private endedOf(session: Session, status: GameEnded['status'], abortedByUserId: string | null, seatResults: FinishedSeat[]): GameEnded {
    return {
      sessionId: session.id,
      lobbyId: session.lobbyId,
      gameId: session.module.id,
      status,
      abortedByUserId,
      results: seatResults.map((r, i) => ({ name: session.players[i].name, placement: r.placement, forfeited: r.forfeited })),
      teamGame: isTeamGame(session),
      userIds: seatedUserIds(session),
    }
  }

  private async finish(session: Session, at: Date): Promise<void> {
    session.status = 'finished'
    const seatResults = results(session)
    // Released even if saving the result fails: its players and boards mustn't stay stuck in a
    // game nobody can play (a restart replays the log and saves the result then)
    try {
      await this.store.finishSession(session.id, at, seatResults)
    } finally {
      this.release(session)
      this.scheduleEviction(session)
    }
    // Everyone still watching sees the game end before the game-end listeners run (the
    // lobby reset, the /ws/me pushes) — same as deleteSession, below
    this.push(session.id)
    await this.notifyEnded(this.endedOf(session, 'finished', null, seatResults))
  }

  async rebuild(): Promise<void> {
    for (const row of await this.store.getActiveSessions()) {
      try {
        await this.rebuildOne(row)
      } catch (err) {
        // One session that can't be replayed (a bad log, a store error, a game module
        // throwing) must not keep the rest from coming back or block the server from
        // starting. Abort it instead of leaving it 'active', where every restart would try
        // (and fail) to bring it back; its log stays untouched for later recovery.
        this.warn('failed to rebuild session, aborting it', { sessionId: row.id, error: String(err) })
        try {
          await this.abortStored(row)
        } catch (abortErr) {
          this.warn('failed to abort an unrebuildable session', { sessionId: row.id, error: String(abortErr) })
        }
      }
    }
  }

  // A stored game that can't be played on: aborted, and its players' lobby resets
  private async abortStored(row: StoredGameSession): Promise<void> {
    await this.store.abortSession(row.id, new Date(), null)
    await this.notifyEnded(storedAborted(row))
  }

  private async rebuildOne(row: StoredGameSession): Promise<void> {
    const mod = games[row.game_id]
    const config = StoredConfigSchema.safeParse(row.config)
    // Unknown game, no owner (account deleted) or unreadable setup: it can't be played on
    if (!mod || !row.owner_user_id || !config.success || row.players.length === 0) {
      await this.abortStored(row)
      return
    }
    const owner = row.owner_user_id
    // A missing controller (account deleted) falls back to the host, so the seat can still
    // be played; a local game's seats already carry the session's board.
    const seats = row.players.map((p): Seat => ({
      name: p.name,
      userId: p.user_id,
      controllerUserId: p.controller_user_id ?? owner,
      boardId: p.board_db_id,
      boardName: p.board_name,
      bot: p.bot_level === null ? null : { level: p.bot_level },
    }))
    const session = newSession({
      id: row.id,
      ownerUserId: owner,
      boardId: row.board_db_id,
      module: mod,
      config: config.data,
      seats,
      seed: row.rng_seed,
      createdAt: row.created_at,
      lobbyId: row.lobby_id,
      lobbyName: row.lobby_name,
    })
    const events = await this.store.getSessionEvents(row.id)
    const { visits, won } = replay(session, events, this.warn)
    // Darts a crash kept from being stored; the ones already there are skipped
    await this.store.insertDarts(visits.flatMap(v => dartRows(row.id, v)))
    // The log ends in a win that wasn't saved: save it instead of resuming
    if (won) {
      session.status = 'finished'
      const seatResults = results(session)
      await this.store.finishSession(row.id, events.at(-1)?.created_at ?? new Date(), seatResults)
      await this.notifyEnded(this.endedOf(session, 'finished', null, seatResults))
      return
    }
    this.index(session)
  }

  getSnapshot(sessionId: string, view: SnapshotView = NO_VIEWER): Snapshot | undefined {
    const session = this.byId.get(sessionId)
    if (!session) return undefined
    const currentVisitDarts = session.openVisitEvents.flatMap(e => (e.kind === 'dart.detected' ? [e.data.dart] : []))
    const engineFields = { currentVisitDarts, totalDarts: session.totalDarts, totalVisits: session.totalVisits }
    const upBoard = session.seats[currentSeat(session)].boardId
    const common = {
      type: 'snapshot' as const,
      sessionId: session.id,
      boardId: session.boardId,
      lobbyId: session.lobbyId,
      lobbyName: session.lobbyName,
      players: session.players,
      status: session.status,
      finishPending: session.status === 'active' && awaitsFinish(session),
      canUndoVisit:
        session.status === 'active' && session.undoable.length > 0 && !session.openVisitEvents.some(e => e.kind === 'dart.detected'),
      ownerUserId: session.ownerUserId,
      seats: seatViews(session, view),
      mySeats: session.seats.flatMap((s, i) => (s.controllerUserId === view.viewerUserId ? [i] : [])),
      // The status pill follows the board of the seat that's up
      bmStatus: upBoard === null ? null : (session.boardStatus.get(upBoard) ?? null),
    }
    // The module's id tells which view (and snapshot shape) it produces; the shape per
    // game is also checked by snapshot.contract.test.ts and checkSnapshot()
    const mod = session.module
    if (mod.id === 'x01') {
      return { ...common, gameId: mod.id, game: { ...mod.view(session.currentState, session.players), ...engineFields } }
    }
    return { ...common, gameId: mod.id, game: { ...mod.view(session.currentState, session.players), ...engineFields } }
  }

  getSession(sessionId: string): Session | undefined {
    return this.byId.get(sessionId)
  }

  getSessionByBoard(boardId: string): Session | undefined {
    return this.byBoard.get(boardId)
  }

  /** The user's running session, if any (as owner, or as any seat's controller). */
  getSessionByUser(userId: string): Session | undefined {
    return this.byUser.get(userId)
  }

  /** The lobby's running game, if any. */
  getLobbySession(lobbyId: string): Session | undefined {
    const s = this.byLobby.get(lobbyId)
    return s?.status === 'active' ? s : undefined
  }

  getAllSessions(): Session[] {
    return Array.from(this.byId.values())
  }

  async deleteSession(sessionId: string, abortedByUserId: string | null = null): Promise<boolean> {
    const session = this.byId.get(sessionId)
    if (!session) return false
    await this.enqueue(sessionId, async () => {
      const wasActive = session.status === 'active'
      if (wasActive) {
        await this.store.abortSession(sessionId, new Date(), abortedByUserId)
        session.status = 'aborted'
      }
      this.release(session)
      // Everyone still watching sees the game end before it goes away
      this.push(sessionId)
      this.forget(session)
      if (wasActive) await this.notifyEnded(this.endedOf(session, 'aborted', abortedByUserId, []))
    })
    return true
  }

  // A finished session no longer holds its boards, its players' one active slot or its lobby.
  // It stays in byId (until scheduleEviction's timer) so its final snapshot can still be shown.
  private release(session: Session): void {
    for (const b of seatBoards(session)) if (this.byBoard.get(b) === session) this.byBoard.delete(b)
    for (const u of distinct([session.ownerUserId, ...controllers(session)])) if (this.byUser.get(u) === session) this.byUser.delete(u)
    if (session.lobbyId !== null && this.byLobby.get(session.lobbyId) === session) this.byLobby.delete(session.lobbyId)
  }

  // A won game is forgotten once late watchers have had keepFinishedMs to see how it ended
  private scheduleEviction(session: Session): void {
    const timer = setTimeout(() => {
      this.forget(session)
    }, this.opts.keepFinishedMs ?? KEEP_FINISHED_MS)
    // A pending eviction never keeps the process alive
    timer.unref()
    this.evictions.set(session.id, timer)
  }

  private forget(session: Session): void {
    clearTimeout(this.evictions.get(session.id))
    this.evictions.delete(session.id)
    if (this.byId.get(session.id) !== session) return
    this.byId.delete(session.id)
    this.opts.forgotten?.(session.id)
  }
}
