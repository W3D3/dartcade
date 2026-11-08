import type { Avatar } from '../db/users.js'
import { z } from 'zod'
import { ClientMessageSchema } from '../schema/zod.js'
import { parseBoardEvent } from './boardEvent.js'
import { applyInput, type GameInput } from './apply.js'
import { newRankedClock } from './rankedClock.js'
import { SystemActionSchema } from './systemInput.js'
import { seededRng } from './rng.js'
import { teamForfeitPlacements } from '../games/teams.js'
import type { NewGameDart } from '../db/queries.js'
import type { AnyGameModule, CommittedVisit, GameConfig, FinishedSeat, RankedGame, ResolvedWork, Seat, Session } from './types.js'

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
  // Each source has its own schema: a user row can't pass for a system input, nor the other way
  if (row.source === 'system') {
    const action = SystemActionSchema.safeParse(row.data)
    return action.success ? { source: 'system', action: action.data } : null
  }
  if (row.source !== 'user') return null
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
  /** The module version a stored game was created with; a new game has the current one. */
  version?: number
  /** The seated accounts' profile pictures (a replay for history needs none). */
  avatars?: Map<string, Avatar>
  ranked?: RankedGame
}): Session {
  const players = a.seats.map(s => ({ name: s.name }))
  const rng = seededRng(a.seed)
  const initial = a.module.init(a.config, players, rng, a.version ?? a.module.version)
  return {
    id: a.id,
    ownerUserId: a.ownerUserId,
    boardId: a.boardId,
    seats: a.seats,
    avatars: a.avatars ?? new Map<string, Avatar>(),
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
    ranked: a.ranked ?? null,
    clock: a.ranked?.rules ? newRankedClock(a.ranked.rules, players.length, a.createdAt) : null,
    undoable: [],
    dartsLeftOnBoard: false,
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

/**
 * Runs the off-thread work the game needs for this input (see GameModule.inputWork) on a scratch
 * copy of the session, so the real apply finds the results ready and doesn't block the thread.
 * They go in `work` if given, else in the game's shared cache.
 */
export async function resolveInputWork(session: Session, input: GameInput, at: Date, work?: ResolvedWork): Promise<void> {
  await session.module.inputWork?.resolve(() => {
    const { openVisitEvents, openDarts, totalDarts, totalVisits } = session
    applyInput(
      {
        ...session,
        openVisitEvents: [...openVisitEvents],
        openDarts: [...openDarts],
        totalDarts: [...totalDarts],
        totalVisits: [...totalVisits],
      },
      input,
      at,
    )
  }, work)
}

/** replay(), for a request path: a game's off-thread work (3D shots) runs off this thread, never on it. */
export async function replayPooled(
  session: Session,
  rows: LoggedInput[],
  warn: WarnFn,
): Promise<{ visits: CommittedVisit<unknown>[]; won: boolean }> {
  // This replay's own results: a long game would evict its earlier ones from the shared cache
  const work: ResolvedWork = new Map()
  const visits: CommittedVisit<unknown>[] = []
  let won = false
  for (const row of rows) {
    const input = parseLoggedInput(row)
    if (!input) {
      warn('skipped a log entry that does not parse', { sessionId: session.id, seq: row.seq, kind: row.kind })
      continue
    }
    await resolveInputWork(session, input, row.created_at, work)
    const apply = () => applyInput(session, input, row.created_at)
    const outcome = session.module.inputWork ? session.module.inputWork.within(apply, work) : apply()
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
