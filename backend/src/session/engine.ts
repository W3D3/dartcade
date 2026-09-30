import { ulid } from 'ulid'
import { games } from '../games/index.js'
import { refoldVisit } from './refold.js'
import { manualDart } from './manualDart.js'
import type { GameConfig, Session, Player, UserAction, Snapshot } from './types.js'
import { parseBoardEvent, readBoardStatus } from './boardEvent.js'
import { isArrayOf, isRecord, isString } from '../guards.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as queries from '../db/queries.js'

type PushFn = (sessionId: string) => void

export interface EngineStore {
  insertSession(data: { id: string; owner_user_id: string; board_db_id: string | null; game_id: string; config: unknown; players: unknown }): Promise<void>
  getActiveSessions(): Promise<Array<{ id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string; config: unknown; players: unknown; created_at: Date }>>
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

// Darts and visits of a bull off (see withBullOff) don't count towards game stats
function inBullOff(session: Session, state: unknown): boolean {
  const view = session.module.view(state, session.players)
  return 'phase' in view && view.phase === 'bulloff'
}

function hasWinner(session: Session, state: unknown): boolean {
  return session.module.view(state, session.players).winner !== null
}

function isPlayer(v: unknown): v is Player {
  return isRecord(v) && isString(v.name)
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
    const initialState = mod.init(config, players)
    const session: Session = {
      id: sessionId, ownerUserId, boardId, players,
      module: mod,
      committedState: initialState,
      openVisitEvents: [],
      currentState: initialState,
      status: 'active',
      createdAt: new Date(),
      totalDarts: Array<number>(players.length).fill(0),
      totalVisits: Array<number>(players.length).fill(0),
      bmStatus: null,
    }
    await this.store.insertSession({ id: sessionId, owner_user_id: ownerUserId, board_db_id: boardId, game_id: gameId, config, players })
    if (boardId) this.byBoard.set(boardId, session)
    this.byOwner.set(ownerUserId, session)
    this.byId.set(sessionId, session)
    return { sessionId }
  }

  async onBridgeEvent(boardId: string, kind: string, data: unknown): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return

    // Kinds the games don't use (and malformed dart data) change nothing but still push
    const event = parseBoardEvent(kind, data)

    switch (event?.kind) {
      case 'visit.opened':
        session.openVisitEvents.push(event)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        break

      case 'dart.detected': {
        const view = session.module.view(session.currentState, session.players)
        if ('visitLocked' in view && view.visitLocked) break
        const thrower = session.module.getCurrentPlayer(session.currentState)
        if (!inBullOff(session, session.currentState)) session.totalDarts[thrower] = (session.totalDarts[thrower] ?? 0) + 1
        session.openVisitEvents.push(event)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
        break
      }

      case 'dart.corrected': {
        const d = event.data
        const idx = session.openVisitEvents.findIndex(e => e.kind === 'dart.detected' && e.data.index === d.index)
        const orig = session.openVisitEvents[idx]
        if (idx !== -1 && orig.kind === 'dart.detected') {
          session.openVisitEvents[idx] = {
            kind: 'dart.detected',
            data: { ...orig.data, dart: d.dart },
          }
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
        if (hasWinner(session, session.currentState)) {
          session.status = 'finished'
          await this.store.setSessionFinished(session.id)
          this.release(session)
        }
        break
      }

      case 'board.status':
        session.bmStatus = readBoardStatus(event.data)
        break

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
      const target = dartEvents.find((_, i) => i === action.visitIndex)
      if (target) {
        const orig = target.data
        // The camera position no longer matches the corrected segment, so drop it,
        // unless the dart was moved to a new spot on the board
        const rest = { ...orig.dart }
        delete rest.coords
        delete rest.polar
        const newDart = { ...rest, ...manualDart(action.segment, action.coords) }
        const idx = session.openVisitEvents.indexOf(target)
        session.openVisitEvents[idx] = {
          kind: 'dart.detected',
          data: { ...orig, dart: newDart },
        }
      }
    } else if (action.type === 'takeout') {
      // An empty turn (nothing thrown or nothing detected) counts as three misses
      if (session.openVisitEvents.length === 0 && !inBullOff(session, session.currentState)
          && !hasWinner(session, session.currentState)) {
        const thrower = session.module.getCurrentPlayer(session.currentState)
        const miss = { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 } as const
        session.openVisitEvents = [
          { kind: 'visit.opened', data: { visit_id: 'manual' } },
          ...[0, 1, 2].map(index => ({
            kind: 'dart.detected' as const,
            data: { visit_id: 'manual', index, dart: manualDart({ ...miss }), source_seq: 0 },
          })),
        ]
        session.totalDarts[thrower] = (session.totalDarts[thrower] ?? 0) + 3
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
      }
      if (session.openVisitEvents.length > 0) {
        const visitOwner = session.module.getCurrentPlayer(session.currentState)
        if (!inBullOff(session, session.currentState)) session.totalVisits[visitOwner] = (session.totalVisits[visitOwner] ?? 0) + 1
        const finalState = session.module.onBoardEvent(
          session.currentState,
          { kind: 'takeout.finished', data: {} },
        ).state
        session.committedState = finalState
        session.currentState = finalState
        session.openVisitEvents = []
        if (hasWinner(session, finalState)) {
          session.status = 'finished'
          await this.store.setSessionFinished(session.id)
          this.release(session)
        }
      }
    } else if (action.type === 'add_dart') {
      const dartCount = session.openVisitEvents.filter(e => e.kind === 'dart.detected').length
      if (dartCount >= 3) return
      // A finished visit (bust, checkout, win) takes no more darts
      const now = session.module.view(session.currentState, session.players)
      if (('visitLocked' in now && now.visitLocked) || now.winner !== null) return
      if (session.openVisitEvents.length === 0) {
        session.openVisitEvents.push({ kind: 'visit.opened', data: { visit_id: 'manual' } })
      }
      // Use the state after the (possibly new) visit.opened to find the thrower
      const opened = refoldVisit(session.module, session.committedState, session.openVisitEvents)
      const thrower = session.module.getCurrentPlayer(opened)
      if (!inBullOff(session, opened)) session.totalDarts[thrower] = (session.totalDarts[thrower] ?? 0) + 1
      session.openVisitEvents.push({
        kind: 'dart.detected',
        data: { visit_id: 'manual', index: dartCount, dart: manualDart(action.segment, action.coords), source_seq: 0 },
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
      const { players, config } = row
      // Stored by create(); anything else can't be restored either
      if (!isArrayOf(players, isPlayer) || !isRecord(config)) {
        await this.store.setSessionFinished(row.id)
        continue
      }
      const initialState = mod.init(config, players)
      const session: Session = {
        id: row.id, ownerUserId: row.owner_user_id, boardId, players,
        module: mod,
        committedState: initialState,
        openVisitEvents: [],
        currentState: initialState,
        status: 'active',
        createdAt: row.created_at,
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
