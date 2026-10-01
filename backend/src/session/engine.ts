import { ulid } from 'ulid'
import { games } from '../games/index.js'
import { applyInput, type GameInput } from './apply.js'
import type { GameConfig, Session, Player, SeatResult, UserAction, Snapshot } from './types.js'
import { parseBoardEvent, readBoardStatus } from './boardEvent.js'
import { newSeed } from './rng.js'
import { StoredConfigSchema, dartRows, newSession, replay, results, type WarnFn } from './replay.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as queries from '../db/queries.js'
import type { NewGameDart, NewGameSession, NewSessionEvent, StoredGameSession, StoredSessionEvent } from '../db/queries.js'

type PushFn = (sessionId: string) => void

export interface EngineStore {
  insertSession(data: NewGameSession): Promise<void>
  getActiveSessions(): Promise<StoredGameSession[]>
  getSessionEvents(sessionId: string): Promise<StoredSessionEvent[]>
  appendEvent(event: NewSessionEvent): Promise<void>
  insertDarts(rows: NewGameDart[]): Promise<void>
  finishSession(id: string, finishedAt: Date, results: SeatResult[]): Promise<void>
  abortSession(id: string, finishedAt: Date): Promise<void>
}

export function createEngineStore(db: Kysely<Database>): EngineStore {
  return {
    insertSession: (d) => queries.insertGameSession(db, d),
    getActiveSessions: () => queries.getActiveGameSessions(db),
    getSessionEvents: (id) => queries.getSessionEvents(db, id),
    appendEvent: (e) => queries.appendSessionEvent(db, e),
    insertDarts: (rows) => queries.insertGameDarts(db, rows),
    finishSession: (id, at, r) => queries.finishGameSession(db, id, at, r),
    abortSession: (id, at) => queries.abortGameSession(db, id, at),
  }
}

/** Thrown when the user already has a session running; carries that session's id. */
export class ActiveSessionError extends Error {
  constructor(message: string, readonly sessionId: string) { super(message) }
}

export class SessionEngine {
  private byBoard: Map<string, Session> = new Map()
  private byId: Map<string, Session> = new Map()
  private byOwner: Map<string, Session> = new Map()
  // Inputs of one session are logged and applied strictly one after another, so the
  // log's order is the order they were applied in
  private queues = new Map<string, Promise<unknown>>()

  constructor(
    private readonly store: EngineStore,
    private readonly push: PushFn,
    private readonly warn: WarnFn = () => undefined,
  ) {}

  async create(
    ownerUserId: string,
    boardId: string | null,
    gameId: string,
    config: GameConfig,
    players: Player[],
  ): Promise<{ sessionId: string }> {
    const mod = games[gameId]
    if (!mod) throw new Error(`unknown game: ${gameId}`)
    const running = this.byOwner.get(ownerUserId)
    if (running) throw new ActiveSessionError('active session already exists for user', running.id)
    if (boardId && this.byBoard.has(boardId)) throw new Error(`active session already exists for board ${boardId}`)
    const invalid = mod.validate?.(config, players)
    if (invalid) throw new Error(`invalid config: ${invalid}`)

    const sessionId = ulid()
    const seed = newSeed()
    const session = newSession({ id: sessionId, ownerUserId, boardId, module: mod, config, players, seed, createdAt: new Date() })
    await this.store.insertSession({
      id: sessionId, owner_user_id: ownerUserId, board_db_id: boardId, game_id: gameId,
      game_version: mod.version, rng_seed: seed, config,
      // Only the creator's seat is an account for now (#41 adds others)
      players: players.map((p, seat) => ({ name: p.name, user_id: seat === 0 ? ownerUserId : null })),
    })
    if (boardId) this.byBoard.set(boardId, session)
    this.byOwner.set(ownerUserId, session)
    this.byId.set(sessionId, session)
    return { sessionId }
  }

  private enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(sessionId) ?? Promise.resolve()).then(task)
    this.queues.set(sessionId, run.catch(() => undefined))
    return run
  }

  async onBridgeEvent(boardId: string, kind: string, data: unknown, bridgeEventId: string | null = null): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return
    const event = parseBoardEvent(kind, data)
    if (!event && (kind === 'dart.detected' || kind === 'dart.corrected')) {
      this.warn(`ignored ${kind} event: data does not match the bridge schema`, { boardId, data })
    }
    // board.status only feeds the status pill: kept on the session, not logged
    if (event?.kind === 'board.status') session.bmStatus = readBoardStatus(event.data)
    else if (event) await this.record(session, { source: 'board', event }, { kind, data }, bridgeEventId)
    this.push(session.id)
  }

  async onUserAction(sessionId: string, action: UserAction): Promise<void> {
    const session = this.byId.get(sessionId)
    if (!session) return
    await this.record(session, { source: 'user', action }, { kind: action.type, data: action }, null)
    this.push(session.id)
  }

  // Log the input (raw, as received), then apply it and store what it committed
  private record(session: Session, input: GameInput, raw: { kind: string; data: unknown }, bridgeEventId: string | null): Promise<void> {
    return this.enqueue(session.id, async () => {
      // A won or aborted game takes no more input
      if (session.status !== 'active') return
      const at = new Date()
      await this.store.appendEvent({
        session_id: session.id, seq: session.nextSeq, source: input.source,
        kind: raw.kind, data: raw.data, bridge_event_id: bridgeEventId, created_at: at,
      })
      session.nextSeq++
      const outcome = applyInput(session, input, at)
      if (outcome.committed) await this.store.insertDarts(dartRows(session.id, outcome.committed))
      if (outcome.won) await this.finish(session, at)
    })
  }

  private async finish(session: Session, at: Date): Promise<void> {
    session.status = 'finished'
    await this.store.finishSession(session.id, at, results(session))
    this.release(session)
  }

  async rebuild(): Promise<void> {
    for (const row of await this.store.getActiveSessions()) {
      try {
        await this.rebuildOne(row)
      } catch (err) {
        // One session that can't be replayed (a bad log, a store error, a game module
        // throwing) must not keep the rest from coming back or block the server from
        // starting. Abort it instead of leaving it 'active': that would lock its owner
        // out of starting a new game (one-active-per-owner); its log stays untouched
        // for later recovery.
        this.warn('failed to rebuild session, aborting it', { sessionId: row.id, error: String(err) })
        try {
          await this.store.abortSession(row.id, new Date())
        } catch (abortErr) {
          this.warn('failed to abort an unrebuildable session', { sessionId: row.id, error: String(abortErr) })
        }
      }
    }
  }

  private async rebuildOne(row: StoredGameSession): Promise<void> {
    const mod = games[row.game_id]
    const config = StoredConfigSchema.safeParse(row.config)
    // Unknown game, no owner (account deleted) or unreadable setup: it can't be played on
    if (!mod || !row.owner_user_id || !config.success || row.players.length === 0) {
      await this.store.abortSession(row.id, new Date())
      return
    }
    const session = newSession({
      id: row.id, ownerUserId: row.owner_user_id, boardId: row.board_db_id, module: mod,
      config: config.data, players: row.players.map(p => ({ name: p.name })),
      seed: row.rng_seed, createdAt: row.created_at,
    })
    const events = await this.store.getSessionEvents(row.id)
    const { visits, won } = replay(session, events, this.warn)
    // Darts a crash kept from being stored; the ones already there are skipped
    await this.store.insertDarts(visits.flatMap(v => dartRows(row.id, v)))
    // The log ends in a win that wasn't saved: save it instead of resuming
    if (won) {
      session.status = 'finished'
      await this.store.finishSession(row.id, events.at(-1)?.created_at ?? new Date(), results(session))
      return
    }
    if (session.boardId) this.byBoard.set(session.boardId, session)
    this.byOwner.set(session.ownerUserId, session)
    this.byId.set(session.id, session)
  }

  getSnapshot(sessionId: string): Snapshot | undefined {
    const session = this.byId.get(sessionId)
    if (!session) return undefined
    const currentVisitDarts = session.openVisitEvents.flatMap(e => e.kind === 'dart.detected' ? [e.data.dart] : [])
    const engineFields = { currentVisitDarts, totalDarts: session.totalDarts, totalVisits: session.totalVisits }
    const common = {
      type: 'snapshot' as const,
      sessionId: session.id,
      boardId: session.boardId,
      players: session.players,
    }
    // The module's id tells which view (and snapshot shape) it produces; the shape per
    // game is also checked by snapshot.contract.test.ts and checkSnapshot()
    const mod = session.module
    if (mod.id === 'x01') {
      return {
        ...common, gameId: mod.id,
        game: { ...mod.view(session.currentState, session.players), ...engineFields },
        bmStatus: session.bmStatus,
      }
    }
    return {
      ...common, gameId: mod.id,
      game: { ...mod.view(session.currentState, session.players), ...engineFields },
      bmStatus: session.bmStatus,
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.byId.get(sessionId)
  }

  getSessionByBoard(boardId: string): Session | undefined {
    return this.byBoard.get(boardId)
  }

  /** The user's running session, if any. */
  getSessionByOwner(userId: string): Session | undefined {
    return this.byOwner.get(userId)
  }

  getAllSessions(): Session[] {
    return Array.from(this.byId.values())
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.byId.get(sessionId)
    if (!session) return false
    await this.enqueue(sessionId, async () => {
      if (session.status === 'active') await this.store.abortSession(sessionId, new Date())
      session.status = 'finished'
      this.release(session)
      this.byId.delete(sessionId)
    })
    return true
  }

  // A finished session no longer holds its board or its owner's one active slot.
  // It stays in byId so its final snapshot can still be shown.
  private release(session: Session): void {
    if (session.boardId && this.byBoard.get(session.boardId) === session) this.byBoard.delete(session.boardId)
    if (this.byOwner.get(session.ownerUserId) === session) this.byOwner.delete(session.ownerUserId)
  }
}
