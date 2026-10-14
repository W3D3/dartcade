// The 3D hole view's pure parts: starting WebGL, and where the chase camera looks.
import { WebGLRenderer } from 'three'
import type { PathPt } from '$shared/minigolf/types'

/** The renderer on `canvas`, or null when the device can't do WebGL. */
export function startRenderer(canvas: HTMLCanvasElement): WebGLRenderer | null {
  try {
    return new WebGLRenderer({ canvas, antialias: true })
  } catch {
    return null
  }
}

/** The 3D view's vertical field of view, degrees. */
export const CHASE_FOV = 32
/** How far ahead the chase camera frames the roll: 1.5 s of 60 Hz frames. */
const WINDOW = 90
/** The closest the chase camera comes to the ball, mm. */
export const MIN_DIST = 1200
const PITCH = Math.PI / 4
/** Room around the framed roll. */
const MARGIN = 1.15
/** How fast the chase camera eases toward its aim, per second (a ~0.6 s time constant). */
export const CHASE_RATE = 1.6
/** The fastest the chase camera closes in, mm/s. */
const ZOOM_IN = 2000

type V = [number, number, number]
type Dir = [number, number]
const full = (p: PathPt): V => [p[0], p[1], p[2] ?? 0]
/** The path at a fractional frame (clamped to it). */
function pointAt(path: readonly PathPt[], i: number): V {
  const k = Math.min(Math.max(0, Math.floor(i)), path.length - 1)
  const a = full(path[k])
  const b = full(path[Math.min(k + 1, path.length - 1)])
  const t = Math.min(1, Math.max(0, i - k))
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
/** The ball at `at` and the path up to WINDOW frames on. */
function stretch(path: readonly PathPt[], at: number): V[] {
  const from = Math.min(Math.max(0, at), path.length - 1)
  const to = Math.min(from + WINDOW, path.length - 1)
  return [pointAt(path, from), ...path.slice(Math.ceil(from), Math.floor(to) + 1).map(full), pointAt(path, to)]
}

/** Where the chase camera aims at frame `at` (fractional) of a 60 Hz path, in course space (x, y,
 *  height): the middle of the ball and the next 1.5 s of its roll, looking along where that stretch
 *  goes. A stretch under 50 mm (a stopping ball) keeps the heading it came in on. */
export function chaseTarget(path: readonly PathPt[], at: number): { look: V; dir: Dir } {
  const window = stretch(path, at)
  const lo = [0, 1, 2].map(k => Math.min(...window.map(p => p[k])))
  const hi = [0, 1, 2].map(k => Math.max(...window.map(p => p[k])))
  const look: V = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
  const end = window[window.length - 1]
  let start = window[0]
  for (
    let k = Math.floor(Math.min(Math.max(0, at), path.length - 1));
    k >= 0 && Math.hypot(end[0] - start[0], end[1] - start[1]) < 50;
    k--
  ) {
    start = full(path[k])
  }
  const d = Math.hypot(end[0] - start[0], end[1] - start[1])
  // Never moved 50 mm: look up the course (-y), as the overview does
  return { look, dir: d >= 50 ? [(end[0] - start[0]) / d, (end[1] - start[1]) / d] : [0, -1] }
}

/** The chase camera's eased state: what it looks at, which way (flat), how steeply down, and from how far. */
export type ChaseCam = { look: V; dir: Dir; pitch: number; dist: number }

/** One frame of the chase camera: eases `cam` (null: start right on the aim) `dt` s toward
 *  chaseTarget, then backs off far enough that the ball and the next 1.5 s of its roll fit the
 *  view (`aspect` = width / height) as seen from where it eased to, and never closer than MIN_DIST.
 *  It backs off at once but closes in eased. */
export function chaseStep(
  cam: ChaseCam | null,
  path: readonly PathPt[],
  at: number,
  dt: number,
  aspect: number,
): { cam: ChaseCam; eye: V; look: V } {
  // Aim where the ball will be one time constant on: the easing trails a moving aim by about that much
  const want = chaseTarget(path, at + 60 / CHASE_RATE)
  const k = cam ? 1 - Math.exp(-dt * CHASE_RATE) : 1
  const from = cam ?? { ...want, pitch: PITCH, dist: 0 }
  const mix = (i: number) => from.look[i] + (want.look[i] - from.look[i]) * k
  const look: V = [mix(0), mix(1), mix(2)]
  const mixed: Dir = [from.dir[0] + (want.dir[0] - from.dir[0]) * k, from.dir[1] + (want.dir[1] - from.dir[1]) * k]
  const n = Math.hypot(...mixed)
  const dir: Dir = n > 1e-6 ? [mixed[0] / n, mixed[1] / n] : want.dir
  const pitch = from.pitch + (PITCH - from.pitch) * k

  const window = stretch(path, at)
  const ball = window[0]
  const dist3 = (p: V) => Math.hypot(p[0] - look[0], p[1] - look[1], p[2] - look[2])
  // Everything to show lies in a sphere round the look point; the narrower of the view's two angles holds it
  const r = Math.max(...window.map(dist3))
  const half = Math.min(CHASE_FOV / 2, (Math.atan(Math.tan(((CHASE_FOV / 2) * Math.PI) / 180) * aspect) * 180) / Math.PI)
  const need = Math.max((r * MARGIN) / Math.sin((half * Math.PI) / 180), MIN_DIST + dist3(ball))
  // Out at once, so nothing leaves the view; in eased and at most ZOOM_IN fast, so the zoom never snaps
  const dist = Math.max(need, from.dist - Math.min((from.dist - need) * k, ZOOM_IN * dt))
  const back = dist * Math.cos(pitch)
  const eye: V = [look[0] - dir[0] * back, look[1] - dir[1] * back, look[2] + dist * Math.sin(pitch)]
  return { cam: { look, dir, pitch, dist }, eye, look }
}

/** The circle round the cup once a hole is played out: how far across and how high, mm. */
export const ORBIT_RADIUS = 1100
const ORBIT_HEIGHT = 650
/** How fast it goes round, radians a second (a full turn in about 10 s). */
export const ORBIT_SPEED = (2 * Math.PI) / 10

/** The camera at `angle` on its circle round the cup (course space: x, y, height). */
export function orbitPose(cup: V, angle: number): { eye: V; look: V } {
  return {
    eye: [cup[0] + Math.cos(angle) * ORBIT_RADIUS, cup[1] + Math.sin(angle) * ORBIT_RADIUS, cup[2] + ORBIT_HEIGHT],
    look: cup,
  }
}

/** How much lighter (or darker) the felt is drawn per mm of height: a relief map's shading, so a
 *  few centimetres of ridge or cone show from above. */
const TINT_PER_MM = 1 / 130

/** The felt's brightness at a height (mm): 1 on the flat, lighter up, darker down, kept in bounds. */
export function heightTint(h: number): number {
  return Math.min(1.7, Math.max(0.55, 1 + h * TINT_PER_MM))
}

/** How much of the canvas the panels over it cover on each side, px. */
export type Insets = { left: number; right: number; top: number; bottom: number }

/**
 * Framing the hole in the part of the canvas the panels leave free: the camera's centre shifted
 * there (setViewOffset's x and y, px), the free part's aspect, and how much further back the camera
 * goes so what fit the whole canvas fits the free part (it keeps the canvas's field of view).
 */
export function framing(w: number, h: number, i: Insets): { offsetX: number; offsetY: number; aspect: number; scale: number } {
  const fw = Math.max(1, w - i.left - i.right)
  const fh = Math.max(1, h - i.top - i.bottom)
  return { offsetX: (i.right - i.left) / 2, offsetY: (i.bottom - i.top) / 2, aspect: fw / fh, scale: h / fh }
}
