import { ulid } from 'ulid'
import { games } from '../games/index.js'
import { refoldVisit } from './refold.js'
import type { GameModule, Session, Player, BoardEvent, UserAction, Snapshot, DartDetectedData } from './types.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as queries from '../db/queries.js'

type PushFn = (sessionId: string) => void

export interface EngineStore {
  insertSession(data: { id: string; board_id: string; game_id: string; config: unknown; players: unknown }): Promise<void>
  getActiveSessions(): Promise<Array<{ id: string; board_id: string; game_id: string; config: unknown; players: unknown; created_at: unknown }>>
  getBridgeEventsForBoard(boardId: string, since: Date): Promise<Array<{ kind: string; data: unknown; recv_wall: unknown }>>
  setSessionFinished(id: string): Promise<void>
}

export function createEngineStore(db: Kysely<Database>): EngineStore {
  return {
    insertSession: (d) => queries.insertSession(db, d),
    getActiveSessions: () => queries.getActiveSessions(db) as any,
    getBridgeEventsForBoard: (boardId, since) => queries.getBridgeEventsForBoard(db, boardId, since) as any,
    setSessionFinished: (id) => queries.setSessionFinished(db, id),
  }
}

export class SessionEngine {
  private byBoard: Map<string, Session> = new Map()
  private byId: Map<string, Session> = new Map()

  constructor(
    private readonly store: EngineStore,
    private readonly push: PushFn,
  ) {}

  async create(
    boardId: string,
    gameId: string,
    config: unknown,
    players: Player[],
  ): Promise<{ sessionId: string }> {
    const mod = games[gameId]
    if (!mod) throw new Error(`unknown game: ${gameId}`)
    if (this.byBoard.has(boardId)) throw new Error(`active session already exists for board ${boardId}`)

    const sessionId = ulid()
    const initialState = (mod as GameModule<unknown, unknown>).init(config as any, players)
    const session: Session = {
      id: sessionId, boardId, players,
      module: mod as GameModule<unknown, unknown>,
      committedState: initialState,
      openVisitEvents: [],
      currentState: initialState,
      status: 'active',
      createdAt: new Date(),
    }
    await this.store.insertSession({ id: sessionId, board_id: boardId, game_id: gameId, config, players })
    this.byBoard.set(boardId, session)
    this.byId.set(sessionId, session)
    return { sessionId }
  }

  async onBridgeEvent(boardId: string, kind: string, data: unknown, _recvWall: Date): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return

    const event: BoardEvent = { kind, data } as BoardEvent

    switch (kind) {
      case 'visit.opened':
      case 'dart.detected':
        session.openVisitEvents.push(event)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        break

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
        session.openVisitEvents.push(event)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        session.committedState = session.currentState
        session.openVisitEvents = []
        const view = session.module.view(session.currentState, session.players) as any
        if (view.winner !== null && view.winner !== undefined) {
          session.status = 'finished'
          await this.store.setSessionFinished(session.id)
          this.byBoard.delete(boardId)
        }
        break
      }

      case 'board.resync': {
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
      for (let i = session.openVisitEvents.length - 1; i >= 0; i--) {
        if (session.openVisitEvents[i].kind === 'dart.detected') {
          session.openVisitEvents.splice(i, 1)
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
    } else if (action.type === 'correct_dart') {
      const dartEvents = session.openVisitEvents.filter(e => e.kind === 'dart.detected')
      const target = dartEvents[action.visitIndex]
      if (target) {
        const orig = target.data as DartDetectedData
        const score = action.segment.number * action.segment.multiplier
        const newDart = { ...orig.dart, segment: action.segment, score }
        const idx = session.openVisitEvents.indexOf(target)
        session.openVisitEvents[idx] = {
          kind: 'dart.detected',
          data: { ...orig, dart: newDart },
        } as BoardEvent
      }
    }

    session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
    this.push(session.id)
  }

  async rebuild(): Promise<void> {
    const rows = await this.store.getActiveSessions()
    for (const row of rows) {
      const mod = games[row.game_id]
      if (!mod) continue
      const players = row.players as Player[]
      const config = row.config
      const initialState = (mod as GameModule<unknown, unknown>).init(config as any, players)
      const session: Session = {
        id: row.id, boardId: row.board_id, players,
        module: mod as GameModule<unknown, unknown>,
        committedState: initialState,
        openVisitEvents: [],
        currentState: initialState,
        status: 'active',
        createdAt: (row.created_at as unknown as Date) ?? new Date(),
      }
      this.byBoard.set(row.board_id, session)
      this.byId.set(row.id, session)

      const events = await this.store.getBridgeEventsForBoard(row.board_id, session.createdAt)
      for (const ev of events) {
        await this.onBridgeEvent(row.board_id, ev.kind, ev.data, ev.recv_wall as unknown as Date)
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
      players: session.players,
      game: { ...session.module.view(session.currentState, session.players), currentVisitDarts },
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.byId.get(sessionId)
  }

  getSessionByBoard(boardId: string): Session | undefined {
    return this.byBoard.get(boardId)
  }

  getAllSessions(): Session[] {
    return Array.from(this.byId.values())
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.byId.get(sessionId)
    if (!session) return false
    session.status = 'finished'
    await this.store.setSessionFinished(sessionId)
    this.byBoard.delete(session.boardId)
    this.byId.delete(sessionId)
    return true
  }
}
