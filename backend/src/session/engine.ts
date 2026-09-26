import { ulid } from 'ulid'
import { games } from '../games/index.js'
import { refoldVisit } from './refold.js'
import type { GameModule, Session, Player, BoardEvent, UserAction, Snapshot, DartDetectedData } from './types.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as queries from '../db/queries.js'

type PushFn = (sessionId: string) => void

export interface EngineStore {
  insertSession(data: { id: string; board_db_id: string; game_id: string; config: unknown; players: unknown }): Promise<void>
  getActiveSessions(): Promise<Array<{ id: string; board_db_id: string; game_id: string; config: unknown; players: unknown; created_at: unknown }>>
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
      totalDarts: new Array(players.length).fill(0),
      totalVisits: new Array(players.length).fill(0),
      bmStatus: null,
    }
    await this.store.insertSession({ id: sessionId, board_db_id: boardId, game_id: gameId, config, players })
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
        session.openVisitEvents.push(event)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        break

      case 'dart.detected': {
        const thrower = session.module.getCurrentPlayer(session.committedState)
        session.totalDarts[thrower] = (session.totalDarts[thrower] ?? 0) + 1
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
        const visitOwner = session.module.getCurrentPlayer(session.committedState)
        session.totalVisits[visitOwner] = (session.totalVisits[visitOwner] ?? 0) + 1
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
        if (dartCount > 0) {
          const thrower = session.module.getCurrentPlayer(session.committedState)
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
      if (dartRemoved) {
        const thrower = session.module.getCurrentPlayer(session.committedState)
        session.totalDarts[thrower] = Math.max(0, (session.totalDarts[thrower] ?? 0) - 1)
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
    } else if (action.type === 'takeout') {
      if (session.openVisitEvents.length > 0) {
        const visitOwner = session.module.getCurrentPlayer(session.committedState)
        session.totalVisits[visitOwner] = (session.totalVisits[visitOwner] ?? 0) + 1
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
          this.byBoard.delete(session.boardId)
        }
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
        id: row.id, boardId: row.board_db_id, players,
        module: mod as GameModule<unknown, unknown>,
        committedState: initialState,
        openVisitEvents: [],
        currentState: initialState,
        status: 'active',
        createdAt: (row.created_at as unknown as Date) ?? new Date(),
        totalDarts: new Array(players.length).fill(0),
        totalVisits: new Array(players.length).fill(0),
      }
      this.byBoard.set(row.board_db_id, session)
      this.byId.set(row.id, session)

      const events = await this.store.getBridgeEventsForBoard(row.board_db_id, session.createdAt)
      for (const ev of events) {
        await this.onBridgeEvent(row.board_db_id, ev.kind, ev.data, ev.recv_wall as unknown as Date)
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
