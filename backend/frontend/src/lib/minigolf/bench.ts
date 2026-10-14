// The test bench's state: where the ball is, strokes, and whether a shot is still rolling.
import { validateHole } from '$shared/minigolf/hole'
import { holeSchema } from '$shared/minigolf/holeSchema'
import { heightAt } from '$shared/minigolf/3d/ground'
import { BALL_R, type Hole, type PathPt, type Pt, type ShotResult } from '$shared/minigolf/types'

export interface BenchState {
  ball: Pt
  strokes: number
  holed: boolean
  rolling: boolean
  /** The ball before each stroke, for undo. */
  history: Pt[]
  /** The last shot's start and path, for Replay; cleared by a miss, undo, placing or a fresh hole. */
  lastShot: { from: Pt; path: PathPt[] } | null
}

export const initBench = (hole: Hole): BenchState => ({
  ball: hole.tee,
  strokes: 0,
  holed: false,
  rolling: false,
  history: [],
  lastShot: null,
})
export const resetBench = initBench
/** Where the ball is drawn at rest, with its height for 3D: one radius above the ground, or where a
 *  3D shot left it in the cup. */
export function benchBall(s: BenchState, hole: Hole): [number, number, number] {
  const end = s.holed ? s.lastShot?.path.at(-1) : undefined
  return end?.[2] !== undefined ? [end[0], end[1], end[2]] : [...s.ball, heightAt(hole, s.ball) + BALL_R]
}
export const canShoot = (s: BenchState): boolean => !s.rolling && !s.holed

export function startShot(s: BenchState): BenchState {
  return { ...s, strokes: s.strokes + 1, rolling: true, history: [...s.history, s.ball] }
}

/** The shot's result, or null for a miss (the stroke counts, the ball stays). `from` is the ball
 *  it was putted from, kept with the path for Replay. */
export function finishShot(s: BenchState, result: Pick<ShotResult, 'rest' | 'holed' | 'path'> | null, from: Pt): BenchState {
  if (!result) return { ...s, rolling: false, lastShot: null }
  return { ...s, ball: result.rest, holed: result.holed, rolling: false, lastShot: { from, path: result.path } }
}

/** Back to the ball before the last stroke. */
export function undoShot(s: BenchState): BenchState {
  if (s.rolling || s.history.length === 0) return s
  return {
    ...s,
    ball: s.history[s.history.length - 1],
    strokes: s.strokes - 1,
    holed: false,
    history: s.history.slice(0, -1),
    lastShot: null,
  }
}

/** Puts the ball anywhere, for testing a tricky spot; no stroke. */
export function placeBall(s: BenchState, at: Pt): BenchState {
  return s.rolling ? s : { ...s, ball: at, holed: false, lastShot: null }
}

/** A hole edited as JSON on the bench: the hole, or why it can't be played. Missing walls,
 *  bumpers and slopes count as none. */
export function parseHole(text: string): { hole: Hole } | { errors: string[] } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { errors: [`invalid JSON: ${e instanceof Error ? e.message : String(e)}`] }
  }
  const parsed = holeSchema.safeParse(raw)
  if (!parsed.success) return { errors: parsed.error.issues.map(i => `${i.path.join('.') || 'hole'}: ${i.message}`) }
  const errors = validateHole(parsed.data)
  return errors.length ? { errors } : { hole: parsed.data }
}
