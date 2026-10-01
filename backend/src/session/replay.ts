import { z } from 'zod'
import { ClientMessageSchema } from '../schema/zod.js'
import { parseBoardEvent } from './boardEvent.js'
import { applyInput, type GameInput } from './apply.js'
import { seededRng } from './rng.js'
import type { NewGameDart } from '../db/queries.js'
import type { AnyGameModule, CommittedVisit, GameConfig, Player, SeatResult, Session } from './types.js'

/** Reports data the engine had to skip (message, details). */
export type WarnFn = (message: string, details: unknown) => void

// A game's config as stored (JSONB), validated before a game is set up from it
export const StoredConfigSchema = z.record(z.string(), z.unknown())

const UserActionSchema = ClientMessageSchema.shape.action

/** A logged input as read back from game_session_events. */
export type LoggedInput = { seq: number; source: string; kind: string; data: unknown; created_at: Date }

/** The input a log entry recorded, or null when it can't be read back. */
export function parseLoggedInput(row: LoggedInput): GameInput | null {
  if (row.source === 'board') {
    const event = parseBoardEvent(row.kind, row.data)
    return event ? { source: 'board', event } : null
  }
  const action = UserActionSchema.safeParse(row.data)
  return action.success ? { source: 'user', action: action.data } : null
}

/** A session at its start, set up exactly like create() set it up. */
export function newSession(a: {
  id: string; ownerUserId: string; boardId: string | null; module: AnyGameModule
  config: GameConfig; players: Player[]; seed: number; createdAt: Date
}): Session {
  const initial = a.module.init(a.config, a.players, seededRng(a.seed))
  return {
    id: a.id, ownerUserId: a.ownerUserId, boardId: a.boardId, players: a.players, module: a.module,
    committedState: initial, currentState: initial, openVisitEvents: [], openDarts: [],
    status: 'active', createdAt: a.createdAt, seed: a.seed, visitCount: 0, nextSeq: 0,
    totalDarts: Array<number>(a.players.length).fill(0),
    totalVisits: Array<number>(a.players.length).fill(0),
    bmStatus: null,
  }
}

/** Re-applies a game's logged inputs in order; returns the visits they committed. */
export function replay(session: Session, rows: LoggedInput[], warn: WarnFn): { visits: CommittedVisit<unknown>[]; won: boolean } {
  const visits: CommittedVisit<unknown>[] = []
  let won = false
  for (const row of rows) {
    const input = parseLoggedInput(row)
    if (!input) {
      warn('skipped a log entry that does not parse', { sessionId: session.id, seq: row.seq, kind: row.kind })
      continue
    }
    const outcome = applyInput(session, input, row.created_at)
    if (outcome.committed) visits.push(outcome.committed)
    if (outcome.won) won = true
  }
  session.nextSeq = (rows.at(-1)?.seq ?? -1) + 1
  return { visits, won }
}

/** game_darts rows for a committed visit. */
export function dartRows(sessionId: string, v: CommittedVisit<unknown>): NewGameDart[] {
  return v.darts.map(d => ({
    session_id: sessionId, visit: v.visit, dart_index: d.index, seat: v.seat, leg: v.leg, phase: v.phase,
    segment: d.segment, coords: d.coords, source: d.source, corrected: d.corrected, thrown_at: new Date(d.thrownAt),
  }))
}

/** Each seat's placement and stats for a won game. */
export function results(session: Session): SeatResult[] {
  return session.module.summarize(session.committedState, { totalDarts: session.totalDarts, totalVisits: session.totalVisits })
}
