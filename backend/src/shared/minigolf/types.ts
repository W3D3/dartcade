// Minigolf's data: holes in course space (millimetres, x right, y down) and shots.
// Design: docs/superpowers/specs/2026-10-09-minigolf-core-bench-design.md

export type Pt = readonly [number, number]
/** A point on a shot's path: x, y and, in 3D, the ball centre's height, mm. */
export type PathPt = readonly [number, number, number?]

/** A rail: a polyline, or a closed polygon when `closed` (an obstacle block). */
export interface Wall {
  points: Pt[]
  closed?: boolean
  /** Bounce, 0..1; Physics.wallRestitution when absent. */
  restitution?: number
}

/** A round obstacle the ball bounces off. `kick` (mm/s) is added along the normal on each hit. */
export interface Bumper {
  at: Pt
  r: number
  restitution?: number
  kick?: number
}

/** Ground that isn't flat, pushing the ball with `strength` (mm/s²) while it's on it. A radial
 *  slope is a round hill (strength > 0 pushes away from its centre) or bowl (< 0 pulls in) out to
 *  `radius`; a bump is a ridge from `from` to `to`, falling away on both sides out to `width`. */
export type Slope =
  | { radial: { center: Pt; radius: number; strength: number } }
  | { bump: { from: Pt; to: Pt; width: number; strength: number } }

/** Ground shaped by height, for 3D: a mesa is a raised rectangle from `from` to `to`, falling to
 *  the felt over each side's own width (left, top, right, bottom): a wide side is a ramp, a narrow
 *  one a cliff. In 2D the ground is flat. */
export type Terrain = { mesa: { from: Pt; to: Pt; height: number; edges: [number, number, number, number] } }

export interface Hole {
  id: string
  name: string
  par: number
  /** The felt's edge; rails run along it. */
  outline: Pt[]
  walls: Wall[]
  bumpers: Bumper[]
  slopes: Slope[]
  terrain?: Terrain[]
  tee: Pt
  cup: { at: Pt; r: number }
}

export interface Course {
  id: string
  name: string
  holes: Hole[]
}

/** A putt: a unit direction in course space and power 0..1. */
export interface Shot {
  dir: Pt
  power: number
}

/** Another player's ball on the hole, in the way of a putt (ball contact). */
export interface OtherBall {
  id: number
  at: Pt
}

/** Another player's ball a putt moved: its path (same timeline as the putt's), where it stopped. */
export interface MovedBall {
  id: number
  path: PathPt[]
  rest: Pt
  holed: boolean
}

/** `path` is the ball sampled at 60 Hz for animation, starting at the ball and ending at `rest`.
 *  `others`: the balls it knocked, when other balls were on the hole. */
export interface ShotResult {
  path: PathPt[]
  rest: Pt
  holed: boolean
  others?: MovedBall[]
  /** When the ball knocked into a rail, wall, bumper or ball, in (fractional) path samples. */
  hits: number[]
}

/** A golf ball, 42.7 mm across. */
export const BALL_R = 21.35
