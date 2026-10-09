// Minigolf's data: holes in course space (millimetres, x right, y down) and shots.
// Design: docs/superpowers/specs/2026-10-09-minigolf-core-bench-design.md

export type Pt = readonly [number, number]

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

/** An area that pushes the ball while it's inside: a constant force (mm/s²), or radial around
 *  a centre (strength > 0 pushes away, a summit; < 0 pulls in, a bowl). */
export type Slope = { area: Pt[]; force: Pt } | { area: Pt[]; radial: { center: Pt; strength: number } }

export interface Hole {
  id: string
  name: string
  par: number
  /** The felt's edge; rails run along it. */
  outline: Pt[]
  walls: Wall[]
  bumpers: Bumper[]
  slopes: Slope[]
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
  path: Pt[]
  rest: Pt
  holed: boolean
}

/** `path` is the ball sampled at 60 Hz for animation, starting at the ball and ending at `rest`.
 *  `others`: the balls it knocked, when other balls were on the hole. */
export interface ShotResult {
  path: Pt[]
  rest: Pt
  holed: boolean
  others?: MovedBall[]
}

/** A golf ball, 42.7 mm across. */
export const BALL_R = 21.35
