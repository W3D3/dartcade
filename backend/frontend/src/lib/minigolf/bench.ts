// The test bench's state: where the ball is, strokes, and whether a shot is still rolling. Also
// the 3D putt, aim dial/preview and shot-playback helpers shared by the bench and Playtest
// (bench.svelte keeps its own 2D-physics path; everything here is framework-free).
import { validateHole } from '$shared/minigolf/hole'
import { holeSchema } from '$shared/minigolf/holeSchema'
import { heightAt } from '$shared/minigolf/3d/ground'
import { initPhysics3d, simulateShot3d } from '$shared/minigolf/3d/physics3d'
import { R } from '$shared/board'
import type { Physics } from '$shared/minigolf/physics'
import { powerAt, shotFromDart } from '$shared/minigolf/shot'
import { BALL_R, type Hole, type PathPt, type Pt, type ShotResult } from '$shared/minigolf/types'
import { playFrames, playPath } from './animate.js'

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

/** A point in the course (x, y) with its height (z), mm. */
export type Pt3 = [number, number, number]

/** A path point's drawn height: its own, or the ground's height here plus the ball's radius. */
export function withHeight(hole: Hole, p: PathPt): Pt3 {
  return [p[0], p[1], p[2] ?? heightAt(hole, [p[0], p[1]]) + BALL_R]
}

/** A dart's putt, simulated with 3D physics (loading Rapier on first use): the rolled path, with
 *  heights filled in for drawing, where it ends and whether it holed — or null for a miss (off
 *  the board). `assist` snaps the aim onto the cup within the physics's assist angle. */
export async function putt3d(
  hole: Hole,
  physics: Physics,
  from: Pt,
  coords: { x: number; y: number } | null,
  assist: boolean,
): Promise<{ path: Pt3[]; rest: Pt; holed: boolean } | null> {
  const shot = shotFromDart(coords, from, hole.cup.at, physics, assist ? hole : null)
  if (!shot) return null
  await initPhysics3d()
  const r = simulateShot3d(hole, physics, from, shot)
  return { ...r, path: r.path.map(p => withHeight(hole, p)) }
}

/** The aim dial and reach rings around the ball: its reach worked out, a dart mid-treble, one on
 *  the double wire. Null while a shot is rolling or the hole is already holed. */
export function aimDial(s: BenchState, physics: Physics): { at: Pt; treble: number; double: number } | null {
  return canShoot(s)
    ? { at: s.ball, treble: powerAt((R.si + R.tr) / 2, physics) * physics.maxRoll, double: powerAt(1, physics) * physics.maxRoll }
    : null
}

/** The putt the pointer would make: as long as it would roll on flat felt. Null while not
 *  hovering, mid-roll or holed. `assist` snaps it onto the cup, as in `putt3d`. */
export function aimPreview(
  s: BenchState,
  hole: Hole,
  physics: Physics,
  hover: { x: number; y: number } | null,
  assist: boolean,
): { from: Pt; dir: Pt; power: number; roll: number } | null {
  if (!hover || !canShoot(s)) return null
  const shot = shotFromDart(hover, s.ball, hole.cup.at, physics, assist ? hole : null)
  return shot && { from: s.ball, ...shot, roll: shot.power * physics.maxRoll }
}

/** `aimPreview`'s result as the 3D/2D views' `aims` line list: the current try's putt, bright. */
export function aimLines(preview: ReturnType<typeof aimPreview>): { from: Pt; dir: Pt; roll: number; current: boolean }[] {
  return preview ? [{ ...preview, current: true }] : []
}

/** Plays a 3D path once, frame by frame (or jumps to the end with reduced motion), calling
 *  `onFrame` with the ball's position and the chase camera's frame (the whole path and how far
 *  along it, for `Hole3D`'s `follow`) on each one. */
export function playShot(
  path: Pt3[],
  onFrame: (ball: Pt3, chase: { path: Pt3[]; at: number }) => void,
  reducedMotion: boolean,
): Promise<void> {
  return new Promise<void>(onDone => playFrames(path.length, at => onFrame(path[Math.floor(at)], { path, at }), reducedMotion, { onDone }))
}

/** Plays a stored shot's path again, in real time, calling `onFrame` the same way as `playShot`. */
export function playReplay(
  path: Pt3[],
  onFrame: (ball: Pt3, chase: { path: Pt3[]; at: number }) => void,
  reducedMotion: boolean,
): Promise<void> {
  return playPath(path, p => onFrame(p, { path, at: path.indexOf(p) }), reducedMotion)
}

/** The bench's and Playtest's shared button style. */
export const BUTTON =
  'h-9 rounded-[10px] border border-line-2 bg-surface-2 px-3 text-text text-[15px] font-medium font-[inherit] cursor-pointer hover:bg-surface-hover disabled:opacity-50 disabled:cursor-default'
