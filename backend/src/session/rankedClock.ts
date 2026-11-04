import { DISCONNECT_SECONDS } from '../shared/ranked.js'
import type { Session } from './types.js'

/** The ranked rules a game starts with (stored in ranked_matches, so a restart brings them back). */
export type RankedRules = { visitSeconds: number; reserveSeconds: number; manualEntry: boolean }
export type Stakes = { win: number; loss: number }

/**
 * A ranked game's clock. The visit timer is lenient on purpose (it only stops stalling): a visit
 * starts when the last one was committed, it has `visitSeconds`, then the team's reserve runs.
 * It only moves when a visit is committed (chargeVisit, called from applyInput with the logged
 * time), so a replay of the log ends up with the same reserves. Running out is a forfeit input.
 */
export type RankedClock = {
  rules: RankedRules
  /** Per seat, by seat index: what a win and a loss are worth to its side; null while placing. */
  stakes: (Stakes | null)[]
  /** When the open visit started (ms): the last committed visit's time, or the game's start. */
  visitStart: number
  /** Reserve left (ms), by team (a seat's own index without teams). */
  reserve: number[]
  /** Controllers that have the game closed, since when (ms). Live only; see SessionEngine.tickRanked. */
  absentSince: Map<string, number>
}

export function newRankedClock(rules: RankedRules, stakes: (Stakes | null)[], seatCount: number, startedAt: Date): RankedClock {
  return {
    rules,
    stakes,
    visitStart: startedAt.getTime(),
    reserve: Array<number>(seatCount).fill(rules.reserveSeconds * 1000),
    absentSince: new Map(),
  }
}

/** The team of every seat (a seat's own index in singles). */
export function teamsOfSeats(session: Session): number[] {
  return session.module.teamsOf?.(session.committedState) ?? session.seats.map((_, i) => i)
}

/** A visit by `team` was committed at `at`: what ran past the visit time comes off its reserve. */
export function chargeVisit(clock: RankedClock, team: number, at: Date): void {
  const over = Math.max(0, at.getTime() - clock.visitStart - clock.rules.visitSeconds * 1000)
  clock.reserve[team] = Math.max(0, clock.reserve[team] - over)
  clock.visitStart = at.getTime()
}

/** When the visit of `team` runs over, and when its reserve is gone (ms). */
export function deadlines(clock: RankedClock, team: number): { visitDeadline: number; forfeitAt: number } {
  const visitDeadline = clock.visitStart + clock.rules.visitSeconds * 1000
  return { visitDeadline, forfeitAt: visitDeadline + clock.reserve[team] }
}

/** Reserve left for `team` at `now` (ms), counting the open visit if it is the team that is up. */
export function reserveLeft(clock: RankedClock, team: number, up: boolean, now: number): number {
  if (!up) return clock.reserve[team]
  const { visitDeadline, forfeitAt } = deadlines(clock, team)
  return Math.max(0, forfeitAt - Math.max(now, visitDeadline))
}

export const DISCONNECT_MS = DISCONNECT_SECONDS * 1000
