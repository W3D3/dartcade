// The test bench's state: where the ball is, strokes, and whether a shot is still rolling.
import type { Hole, Pt, ShotResult } from '$shared/minigolf/types'

export interface BenchState {
  ball: Pt
  strokes: number
  holed: boolean
  rolling: boolean
  /** The ball before each stroke, for undo. */
  history: Pt[]
}

export const initBench = (hole: Hole): BenchState => ({ ball: hole.tee, strokes: 0, holed: false, rolling: false, history: [] })
export const resetBench = initBench
export const canShoot = (s: BenchState): boolean => !s.rolling && !s.holed

export function startShot(s: BenchState): BenchState {
  return { ...s, strokes: s.strokes + 1, rolling: true, history: [...s.history, s.ball] }
}

/** The shot's result, or null for a miss (the stroke counts, the ball stays). */
export function finishShot(s: BenchState, result: ShotResult | null): BenchState {
  if (!result) return { ...s, rolling: false }
  return { ...s, ball: result.rest, holed: result.holed, rolling: false }
}

/** Back to the ball before the last stroke. */
export function undoShot(s: BenchState): BenchState {
  if (s.rolling || s.history.length === 0) return s
  return { ...s, ball: s.history[s.history.length - 1], strokes: s.strokes - 1, holed: false, history: s.history.slice(0, -1) }
}

/** Puts the ball anywhere, for testing a tricky spot; no stroke. */
export function placeBall(s: BenchState, at: Pt): BenchState {
  return s.rolling ? s : { ...s, ball: at, holed: false }
}
