import { ulid } from 'ulid'
import { games } from '../games/index.js'
import { refoldVisit } from './refold.js'
import { manualDart } from './manualDart.js'
import type { GameModule, Session, Player, BoardEvent, UserAction, Snapshot, DartDetectedData } from './types.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as queries from '../db/queries.js'

type PushFn = (sessionId: string) => void

export interface EngineStore {
  insertSession(data: { id: string; owner_user_id: string; board_db_id: string | null; game_id: string; config: unknown; players: unknown }): Promise<void>
  getActiveSessions(): Promise<Array<{ id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string; config: unknown; players: unknown; created_at: unknown }>>
  getBridgeEventsForBoard(boardDbId: string, since: Date): Promise<Array<{ kind: string; data: unknown; recv_wall: unknown }>>
  setSessionFinished(id: string): Promise<void>
}

export function createEngineStore(db: Kysely<Database>): EngineStore {
  return {
    insertSession: (d) => queries.insertGameSession(db, d),
    getActiveSessions: () => queries.getActiveGameSessions(db) as any,
    getBridgeEventsForBoard: (boardDbId, since) => queries.getBridgeEventsForBoardDbId(db, boardDbId, since) as any,
    setSessionFinished: (id) => queries.setGameSessionFinished(db, id),
  }
}

/** Thrown when the user already has a session running; carries that session's id. */
export class ActiveSessionError extends Error {
  constructor(message: string, readonly sessionId: string) { super(message) }
}

// Darts and visits of a bull off (see withBullOff) don't count towards game stats
function inBullOff(session: Session, state: unknown): boolean {
  return (session.module.view(state, session.players) as { phase?: unknown }).phase === 'bulloff'
}

export class SessionEngine {
  private byBoard: Map<string, Session> = new Map()
  private byId: Map<string, Session> = new Map()
  private byOwner: Map<string, Session> = new Map()

  constructor(
    private readonly store: EngineStore,
    private readonly push: PushFn,
  ) {}

  async create(
    ownerUserId: string,
    boardId: string | null,
    gameId: string,
    config: unknown,
    players: Player[],
  ): Promise<{ sessionId: string }> {
    const mod = games[gameId]
    if (!mod) throw new Error(`unknown game: ${gameId}`)
    const running = this.byOwner.get(ownerUserId)
    if (running) throw new ActiveSessionError('active session already exists for user', running.id)
    if (boardId && this.byBoard.has(boardId)) throw new Error(`active session already exists for board ${boardId}`)
    const invalid = (mod as GameModule<unknown, unknown>).validate?.(config, players)
    if (invalid) throw new Error(`invalid config: ${invalid}`)

    const sessionId = ulid()
    const initialState = (mod as GameModule<unknown, unknown>).init(config as any, players)
    const session: Session = {
      id: sessionId, ownerUserId, boardId, players,
      module: mod as GameModule<unknown, unknown>,
      committedState: initialState,
      openVisitEvents: [],
      currentState: initialState,
      status: 'active',
      createdAt: new Date(),
      totalDarts: new Array(players.length).fill(0),
      totalVisits: new Array(players.length).fill(0),
      bmStatus: null,
    }
    await this.store.insertSession({ id: sessionId, owner_user_id: ownerUserId, board_db_id: boardId, game_id: gameId, config, players })
    if (boardId) this.byBoard.set(boardId, session)
    this.byOwner.set(ownerUserId, session)
    this.byId.set(sessionId, session)
    return { sessionId }
  }

  async onBridgeEvent(boardId: string, kind: string, data: unknown, _recvWall: Date): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return

    const event: BoardEvent = { kind, data } as BoardEvent

    switch (kind) {
      case 'visit.opened':
        session.openVisitEvents.push(event)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        break

      case 'dart.detected': {
        const view = session.module.view(session.currentState, session.players) as any
        if (view.visitLocked) break
        const thrower = session.module.getCurrentPlayer(session.currentState)
        if (!inBullOff(session, session.currentState)) session.totalDarts[thrower] = (session.totalDarts[thrower] ?? 0) + 1
        session.openVisitEvents.push(event)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        break
      }

      case 'dart.corrected': {
        const d = data as any
        const idx = session.openVisitEvents.findIndex(
          e => e.kind === 'dart.detected' && (e.data as DartDetectedData).index === d.index,
        )
        if (idx !== -1) {
          const orig = session.openVisitEvents[idx].data as DartDetectedData
          session.openVisitEvents[idx] = {
            kind: 'dart.detected',
            data: { ...orig, dart: d.dart },
          } as BoardEvent
        }
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        break
      }

      case 'takeout.finished':
      case 'visit.cleared': {
        const visitOwner = session.module.getCurrentPlayer(session.currentState)
        if (!inBullOff(session, session.currentState)) session.totalVisits[visitOwner] = (session.totalVisits[visitOwner] ?? 0) + 1
        session.openVisitEvents.push(event)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        session.committedState = session.currentState
        session.openVisitEvents = []
        const view = session.module.view(session.currentState, session.players) as any
        if (view.winner !== null && view.winner !== undefined) {
          session.status = 'finished'
          await this.store.setSessionFinished(session.id)
          this.release(session)
        }
        break
      }

      case 'board.status': {
        const d = data as { status?: string; running?: boolean; event?: string }
        session.bmStatus = {
          status:  d.status  ?? '',
          running: d.running ?? false,
          event:   d.event   ?? '',
        }
        break
      }

      case 'board.resync': {
        const dartCount = session.openVisitEvents.filter(e => e.kind === 'dart.detected').length
        if (dartCount > 0 && !inBullOff(session, session.currentState)) {
          const thrower = session.module.getCurrentPlayer(session.currentState)
          session.totalDarts[thrower] = Math.max(0, (session.totalDarts[thrower] ?? 0) - dartCount)
        }
        session.openVisitEvents = []
        session.currentState = session.committedState
        break
      }
    }

    this.push(session.id)
  }

  async onUserAction(sessionId: string, action: UserAction): Promise<void> {
    const session = this.byId.get(sessionId)
    if (!session) return

    if (action.type === 'undo_dart') {
      let dartRemoved = false
      for (let i = session.openVisitEvents.length - 1; i >= 0; i--) {
        if (session.openVisitEvents[i].kind === 'dart.detected') {
          session.openVisitEvents.splice(i, 1)
          dartRemoved = true
          if (
            i > 0 &&
            session.openVisitEvents[i - 1]?.kind === 'visit.opened' &&
            !session.openVisitEvents.slice(i).some(e => e.kind === 'dart.detected')
          ) {
            session.openVisitEvents.splice(i - 1, 1)
          }
          break
        }
      }
      if (dartRemoved && !inBullOff(session, session.currentState)) {
        const thrower = session.module.getCurrentPlayer(session.currentState)
        session.totalDarts[thrower] = Math.max(0, (session.totalDarts[thrower] ?? 0) - 1)
      }
    } else if (action.type === 'correct_dart') {
      const dartEvents = session.openVisitEvents.filter(e => e.kind === 'dart.detected')
      const target = dartEvents[action.visitIndex]
      if (target) {
        const orig = target.data as DartDetectedData
        // The camera position no longer matches the corrected segment, so drop it,
        // unless the dart was moved to a new spot on the board
        const { coords: _c, polar: _p, ...rest } = orig.dart
        const newDart = { ...rest, ...manualDart(action.segment, action.coords) }
        const idx = session.openVisitEvents.indexOf(target)
        session.openVisitEvents[idx] = {
          kind: 'dart.detected',
          data: { ...orig, dart: newDart },
        } as BoardEvent
      }
    } else if (action.type === 'takeout') {
      if (session.openVisitEvents.length > 0) {
        const visitOwner = session.module.getCurrentPlayer(session.currentState)
        if (!inBullOff(session, session.currentState)) session.totalVisits[visitOwner] = (session.totalVisits[visitOwner] ?? 0) + 1
        const finalState = session.module.onBoardEvent(
          session.currentState,
          { kind: 'takeout.finished', data: {} as any },
        ).state
        session.committedState = finalState
        session.currentState = finalState
        session.openVisitEvents = []
        const view = session.module.view(finalState, session.players) as any
        if (view.winner !== null && view.winner !== undefined) {
          session.status = 'finished'
          await this.store.setSessionFinished(session.id)
          this.release(session)
        }
      }
    } else if (action.type === 'add_dart') {
      const dartCount = session.openVisitEvents.filter(e => e.kind === 'dart.detected').length
      if (dartCount >= 3) return
      if (session.openVisitEvents.length === 0) {
        session.openVisitEvents.push({ kind: 'visit.opened', data: { visit_id: 'manual' } as any })
      }
      // visit.opened may have just ended the bull off, so use the state it leads to
      const opened = refoldVisit(session.module, session.committedState, session.openVisitEvents)
      const thrower = session.module.getCurrentPlayer(opened)
      if (!inBullOff(session, opened)) session.totalDarts[thrower] = (session.totalDarts[thrower] ?? 0) + 1
      session.openVisitEvents.push({
        kind: 'dart.detected',
        data: { visit_id: 'manual', index: dartCount, dart: manualDart(action.segment, action.coords), source_seq: 0 } as any,
      })
    } else {
      // Anything else is the game module's own action (e.g. the bull off's
      // skip/rethrow/start). It ends the open visit and becomes committed state.
      const next = session.module.onUserAction(session.currentState, action).state
      if (next !== session.currentState) {
        session.committedState = next
        session.openVisitEvents = []
      }
    }

    session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
    this.push(session.id)
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
      const players = row.players as Player[]
      const config = row.config
      const initialState = (mod as GameModule<unknown, unknown>).init(config as any, players)
      const session: Session = {
        id: row.id, ownerUserId: row.owner_user_id, boardId, players,
        module: mod as GameModule<unknown, unknown>,
        committedState: initialState,
        openVisitEvents: [],
        currentState: initialState,
        status: 'active',
        createdAt: (row.created_at as unknown as Date) ?? new Date(),
        totalDarts: new Array(players.length).fill(0),
        totalVisits: new Array(players.length).fill(0),
        bmStatus: null,
      }
      this.byBoard.set(boardId, session)
      this.byOwner.set(row.owner_user_id, session)
      this.byId.set(row.id, session)

      const events = await this.store.getBridgeEventsForBoard(boardId, session.createdAt)
      for (const ev of events) {
        await this.onBridgeEvent(boardId, ev.kind, ev.data, ev.recv_wall as unknown as Date)
      }
    }
  }

  getSnapshot(sessionId: string): Snapshot | undefined {
    const session = this.byId.get(sessionId)
    if (!session) return undefined
    const currentVisitDarts = session.openVisitEvents
      .filter(e => e.kind === 'dart.detected')
      .map(e => (e.data as DartDetectedData).dart)
    return {
      type: 'snapshot',
      sessionId: session.id,
      gameId: session.module.id,
      boardId: session.boardId,
      players: session.players,
      game: {
        ...session.module.view(session.currentState, session.players),
        currentVisitDarts,
        totalDarts: session.totalDarts,
        totalVisits: session.totalVisits,
      },
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
