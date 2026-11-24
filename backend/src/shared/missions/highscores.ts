// Comparing two completed runs of a mission: by time (darts break a tie), or for a mission ranked by
// darts the other way round.
import type { Mission } from './types.js'

export type RunResult = { timeMs: number; darts: number }

/** Negative when `a` ranks ahead of `b`. */
export function compareRuns(rankBy: Mission['rankBy'], a: RunResult, b: RunResult): number {
  return rankBy === 'darts' ? a.darts - b.darts || a.timeMs - b.timeMs : a.timeMs - b.timeMs || a.darts - b.darts
}

/**
 * Whether runs of `a` and `b` compare: everything but the name and description is the same. A
 * change to the rules starts the highscores afresh.
 */
export function sameRules(a: Mission, b: Mission): boolean {
  const rules = ({ name: _name, description: _description, ...rest }: Mission) => JSON.stringify(rest)
  return rules(a) === rules(b)
}
