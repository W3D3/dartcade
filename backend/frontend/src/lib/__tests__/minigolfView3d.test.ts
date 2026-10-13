import { describe, it, expect, vi } from 'vitest'
import type { PathPt } from '$shared/minigolf/types'

const WebGLRenderer = vi.fn()
vi.mock('three', () => ({ WebGLRenderer }))
const { chaseStep, chaseTarget, startRenderer, CHASE_FOV, MIN_DIST } = await import('$lib/minigolf/view3d')

describe('startRenderer', () => {
  it('is null when WebGL cannot start', () => {
    WebGLRenderer.mockImplementation(function () {
      throw new Error('Error creating WebGL context.')
    })
    expect(startRenderer({} as HTMLCanvasElement)).toBeNull()
  })

  it('gives the renderer when it starts', () => {
    const renderer = { ok: true }
    WebGLRenderer.mockImplementation(function () {
      return renderer
    })
    expect(startRenderer({} as HTMLCanvasElement)).toBe(renderer)
  })
})

type V = [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: V) => Math.hypot(...a)
const angle = (a: V, b: V) => Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b))))
const deg = (r: number) => (r * 180) / Math.PI
/** Where the camera looks, flat on the ground, in degrees (0 = +x, 90 = +y). */
const bearing = (t: { eye: V; look: V }) => deg(Math.atan2(t.look[1] - t.eye[1], t.look[0] - t.eye[0]))
const full = (p: PathPt): V => [p[0], p[1], p[2] ?? 0]

/** Plays a path at 60 Hz through chaseStep, as Hole3D does, from `cam` (null: start on the aim). */
function chase(path: PathPt[], aspect: number, cam: Parameters<typeof chaseStep>[0] = null) {
  const steps: { at: number; eye: V; look: V }[] = []
  for (let at = 0; at < path.length; at++) {
    const r = chaseStep(cam, path, at, 1 / 60, aspect)
    cam = r.cam
    steps.push({ at, eye: r.eye, look: r.look })
  }
  return steps
}
/** The most the camera closes in on its look point in one frame, mm. */
const maxZoomIn = (steps: { eye: V; look: V }[]) =>
  Math.max(...steps.slice(1).map((s, i) => len(sub(steps[i].look, steps[i].eye)) - len(sub(s.look, s.eye))))
/** The narrower half-angle of a CHASE_FOV view of this aspect, degrees. */
const halfView = (aspect: number) => Math.min(CHASE_FOV / 2, deg(Math.atan(Math.tan((CHASE_FOV / 2 / 180) * Math.PI) * aspect)))

describe('the chase camera', () => {
  // 3 m/s for 2 s along x, sampled at 60 Hz: a full-power putt
  const fast: PathPt[] = Array.from({ length: 120 }, (_, i) => [100 + i * 50, 500, 21])

  it('keeps the ball and the next 1.5 s of a fast roll in view while it eases, landscape and portrait', () => {
    for (const aspect of [16 / 9, 0.6]) {
      for (const { at, eye, look } of chase(fast, aspect)) {
        const ray = sub(look, eye)
        for (let i = at; i <= Math.min(119, at + 90); i++) {
          expect(deg(angle(sub(full(fast[i]), eye), ray))).toBeLessThan(halfView(aspect))
        }
      }
    }
  })

  it('keeps a fast ball in view when it starts from the overview', () => {
    const overview = { look: [1500, 1000, 0] as V, dir: [0, -1] as [number, number], pitch: (55 * Math.PI) / 180, dist: 7800 }
    const steps = chase(fast, 16 / 9, overview)
    for (const { at, eye, look } of steps) {
      expect(deg(angle(sub(full(fast[at]), eye), sub(look, eye)))).toBeLessThan(halfView(16 / 9))
    }
    expect(len(sub(steps[0].look, steps[0].eye))).toBeGreaterThan(7800 - 40)
    expect(maxZoomIn(steps)).toBeLessThan(40)
  })

  it('stays at least 1200 mm from the ball and settles 45° down behind it', () => {
    const steps = chase(fast, 16 / 9)
    for (const { at, eye } of steps) expect(len(sub(full(fast[at]), eye))).toBeGreaterThan(MIN_DIST - 1e-6)
    const { eye, look } = steps[60]
    const ray = sub(look, eye)
    expect(bearing({ eye, look })).toBeCloseTo(0)
    expect(deg(Math.asin(-ray[2] / len(ray)))).toBeCloseTo(45)
  })

  it('keeps the last heading once the ball stops', () => {
    const stopped: PathPt[] = [...fast, ...Array.from({ length: 60 }, (): PathPt => [6050, 500, 21])]
    expect(chaseTarget(stopped, 170).dir[0]).toBeCloseTo(1)
    expect(bearing(chase(stopped, 16 / 9).at(-1)!)).toBeCloseTo(0)
  })

  it('closes in smoothly through a bounce off a wall, landscape and portrait', () => {
    // 3 m/s east into a wall at 2 m, back at 0.7×, slowing to a stop
    const back: PathPt[] = []
    let x = 0
    let v = 50
    for (let i = 0; i < 200; i++) {
      back.push([x, 0, 21])
      x += v
      if (x >= 2000) {
        x = 4000 - x
        v = -v * 0.7
      }
      v *= 0.985
    }
    for (const aspect of [16 / 9, 0.6]) expect(maxZoomIn(chase(back, aspect))).toBeLessThan(40)
  })

  it('turns smoothly through a bounce, never past the bounce’s own turn', () => {
    // East for 40 frames, then off a wall to the north
    const bounce: PathPt[] = Array.from({ length: 160 }, (_, i) => (i < 40 ? [i * 30, 0] : [1200, (i - 40) * 30]))
    const steps = chase(bounce, 16 / 9)
    expect(maxZoomIn(steps)).toBeLessThan(40)
    let before = bearing(steps[0])
    for (const step of steps) {
      const now = bearing(step)
      expect(now).toBeLessThanOrEqual(90 + 1e-6)
      expect(now).toBeGreaterThanOrEqual(-1e-6)
      expect(Math.abs(now - before)).toBeLessThan(3)
      before = now
    }
  })
})
