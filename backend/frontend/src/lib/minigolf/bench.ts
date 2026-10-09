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
