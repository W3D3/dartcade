import { z } from 'zod'
import { ClientMessageSchema } from '../schema/zod.js'
import { parseBoardEvent } from './boardEvent.js'
import { applyInput, type GameInput } from './apply.js'
import { seededRng } from './rng.js'
import { teamForfeitPlacements } from '../games/teams.js'
import type { NewGameDart } from '../db/queries.js'
import type { AnyGameModule, CommittedVisit, GameConfig, FinishedSeat, Seat, Session } from './types.js'

/** Reports data the engine had to skip (message, details). */
export type WarnFn = (message: string, details: unknown) => void

// A game's config as stored (JSONB), validated before a game is set up from it
export const StoredConfigSchema = z.record(z.string(), z.unknown())

const UserActionSchema = ClientMessageSchema.shape.action

/** A logged input as read back from game_session_events. */
export type LoggedInput = { seq: number; source: string; kind: string; data: unknown; created_at: Date }

/** The input a log entry recorded, or null when it can't be read back. */
function parseLoggedInput(row: LoggedInput): GameInput | null {
  if (row.source === 'board') {
    const event = parseBoardEvent(row.kind, row.data)
    return event ? { source: 'board', event } : null
  }
  const action = UserActionSchema.safeParse(row.data)
  return action.success ? { source: 'user', action: action.data } : null
}

/** A session at its start, set up exactly like create() set it up. */
export function newSession(a: {
  id: string
  ownerUserId: string
  boardId: string | null
  module: AnyGameModule
  config: GameConfig
  seats: Seat[]
  seed: number
  createdAt: Date
  lobbyId?: string | null
  lobbyName?: string | null
}): Session {
  const players = a.seats.map(s => ({ name: s.name }))
  const rng = seededRng(a.seed)
  const initial = a.module.init(a.config, players, rng)
  return {
    id: a.id,
    ownerUserId: a.ownerUserId,
    boardId: a.boardId,
    seats: a.seats,
    players,
    module: a.module,
    committedState: initial,
    currentState: initial,
    openVisitEvents: [],
    openDarts: [],
    status: 'active',
    createdAt: a.createdAt,
    seed: a.seed,
    rng,
    visitCount: 0,
    nextSeq: 0,
    totalDarts: Array<number>(players.length).fill(0),
    totalVisits: Array<number>(players.length).fill(0),
    boardStatus: new Map(),
    forfeited: [],
    undoable: [],
    lobbyId: a.lobbyId ?? null,
    lobbyName: a.lobbyName ?? null,
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
    if (outcome.reopened !== undefined) visits.pop()
    if (outcome.committed) visits.push(outcome.committed)
    if (outcome.won) won = true
  }
  session.nextSeq = (rows.at(-1)?.seq ?? -1) + 1
  return { visits, won }
}

/** game_darts rows for a committed visit. */
export function dartRows(sessionId: string, v: CommittedVisit<unknown>): NewGameDart[] {
  return v.darts.map(d => ({
    session_id: sessionId,
    visit: v.visit,
    dart_index: d.index,
    seat: v.seat,
    leg: v.leg,
    phase: v.phase,
    segment: d.segment,
    coords: d.coords,
    source: d.source,
    corrected: d.corrected,
    thrown_at: new Date(d.thrownAt),
  }))
}

/** Each seat's placement and stats once the game is decided (won, or ended by a forfeit). */
export function results(session: Session): FinishedSeat[] {
  const state = session.committedState
  const seats = session.module.summarize(state, { totalDarts: session.totalDarts, totalVisits: session.totalVisits })
  const forfeited = new Set(session.forfeited)
  const teamOf = session.module.teamsOf?.(state) ?? seats.map((_, i) => i)
  // Without a winner, summarize ranks by standing; a forfeit puts its (whole team's) seats last
  const placements =
    forfeited.size > 0
      ? teamForfeitPlacements(
          teamOf,
          seats.map(r => r.placement),
          forfeited,
        )
      : seats.map(r => r.placement)
  const order = session.module.throwOrder?.(state) ?? []
  // A throw order that doesn't name every seat once falls back to seat order
  const valid = order.length === seats.length && seats.every((_, seat) => order.includes(seat))
  return seats.map((r, seat) => ({
    ...r,
    placement: placements[seat],
    throwPosition: valid ? order.indexOf(seat) : seat,
    forfeited: forfeited.has(seat),
  }))
}
