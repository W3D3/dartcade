import { ulid } from 'ulid'
import { games } from '../games/index.js'
import { applyInput, type ApplyOutcome } from './apply.js'
import type { GameConfig, Session, Player, UserAction, Snapshot } from './types.js'
import { parseBoardEvent, readBoardStatus } from './boardEvent.js'
import { newSeed, seededRng } from './rng.js'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as queries from '../db/queries.js'
import type { NewGameSession, StoredGameSession } from '../db/queries.js'

type PushFn = (sessionId: string) => void
/** Reports bridge data the engine had to ignore (message, details). */
type WarnFn = (message: string, details: unknown) => void

export interface EngineStore {
  insertSession(data: NewGameSession): Promise<void>
  getActiveSessions(): Promise<StoredGameSession[]>
  getBridgeEventsForBoard(boardDbId: string, since: Date): Promise<Array<{ kind: string; data: unknown; recv_wall: Date }>>
  setSessionFinished(id: string): Promise<void>
}

export function createEngineStore(db: Kysely<Database>): EngineStore {
  return {
    insertSession: (d) => queries.insertGameSession(db, d),
    getActiveSessions: () => queries.getActiveGameSessions(db),
    getBridgeEventsForBoard: (boardDbId, since) => queries.getBridgeEventsForBoardDbId(db, boardDbId, since),
    setSessionFinished: (id) => queries.setGameSessionFinished(db, id),
  }
}

/** Thrown when the user already has a session running; carries that session's id. */
export class ActiveSessionError extends Error {
  constructor(message: string, readonly sessionId: string) { super(message) }
}

// Rows written by create(): JSONB, so validated before a session is restored from them
const StoredConfigSchema = z.record(z.string(), z.unknown())

export class SessionEngine {
  private byBoard: Map<string, Session> = new Map()
  private byId: Map<string, Session> = new Map()
  private byOwner: Map<string, Session> = new Map()

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
    const initialState = mod.init(config, players, seededRng(seed))
    const session: Session = {
      id: sessionId, ownerUserId, boardId, players,
      module: mod,
      committedState: initialState,
      openVisitEvents: [],
      openDarts: [],
      currentState: initialState,
      status: 'active',
      createdAt: new Date(),
      seed,
      visitCount: 0,
      nextSeq: 0,
      totalDarts: Array<number>(players.length).fill(0),
      totalVisits: Array<number>(players.length).fill(0),
      bmStatus: null,
    }
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

  async onBridgeEvent(boardId: string, kind: string, data: unknown, _bridgeEventId: string | null = null): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return

    // Kinds the games don't use (and malformed dart data) change nothing but still push
    const event = parseBoardEvent(kind, data)
    // A dart the games can't read would otherwise just not count, with no trace
    if (!event && (kind === 'dart.detected' || kind === 'dart.corrected')) {
      this.warn(`ignored ${kind} event: data does not match the bridge schema`, { boardId, data })
    }
    if (event?.kind === 'board.status') session.bmStatus = readBoardStatus(event.data)
    else if (event) await this.settle(session, applyInput(session, { source: 'board', event }, new Date()))
    this.push(session.id)
  }

  async onUserAction(sessionId: string, action: UserAction): Promise<void> {
    const session = this.byId.get(sessionId)
    if (!session) return
    await this.settle(session, applyInput(session, { source: 'user', action }, new Date()))
    this.push(session.id)
  }

  private async settle(session: Session, outcome: ApplyOutcome): Promise<void> {
    if (!outcome.won) return
    session.status = 'finished'
    await this.store.setSessionFinished(session.id)
    this.release(session)
  }

  async rebuild(): Promise<void> {
    const rows = await this.store.getActiveSessions()
    for (const row of rows) {
      const mod = games[row.game_id]
      // Only board sessions can be restored (their darts are stored as bridge
      // events); close the rest so they don't block their owner forever.
      if (!mod || !row.board_db_id || !row.owner_user_id) {
        await this.store.setSessionFinished(row.id)
        continue
      }
      const boardId = row.board_db_id
      // Stored by create(); anything else can't be restored either
      const parsedConfig = StoredConfigSchema.safeParse(row.config)
      const players = row.players.map(p => ({ name: p.name }))
      if (players.length === 0 || !parsedConfig.success) {
        await this.store.setSessionFinished(row.id)
        continue
      }
      const seed = row.rng_seed
      const initialState = mod.init(parsedConfig.data, players, seededRng(seed))
      const session: Session = {
        id: row.id, ownerUserId: row.owner_user_id, boardId, players,
        module: mod,
        committedState: initialState,
        openVisitEvents: [],
        openDarts: [],
        currentState: initialState,
        status: 'active',
        createdAt: row.created_at,
        seed,
        visitCount: 0,
        nextSeq: 0,
        totalDarts: Array<number>(players.length).fill(0),
        totalVisits: Array<number>(players.length).fill(0),
        bmStatus: null,
      }
      this.byBoard.set(boardId, session)
      this.byOwner.set(row.owner_user_id, session)
      this.byId.set(row.id, session)

      const events = await this.store.getBridgeEventsForBoard(boardId, session.createdAt)
      for (const ev of events) {
        await this.onBridgeEvent(boardId, ev.kind, ev.data)
      }
    }
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
    session.status = 'finished'
    await this.store.setSessionFinished(sessionId)
    this.release(session)
    this.byId.delete(sessionId)
    return true
  }

  // A finished session no longer holds its board or its owner's one active slot.
  // It stays in byId so its final snapshot can still be shown.
  private release(session: Session): void {
    if (session.boardId && this.byBoard.get(session.boardId) === session) this.byBoard.delete(session.boardId)
    if (this.byOwner.get(session.ownerUserId) === session) this.byOwner.delete(session.ownerUserId)
  }
}
