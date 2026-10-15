// Putts every way from the tee and from short of the cup on each test hole: no ball leaves the
// course or sinks through it. About 14 s alone, so it has its own file to run beside the others.
import { beforeAll, describe, it, expect } from 'vitest'
import { initPhysics3d, simulateShot3d } from './physics3d.js'
import { heightAt } from './ground.js'
import { pointInPolygon } from '../geometry.js'
import { DEFAULT_PHYSICS as P } from '../physics.js'
import { testCourse } from '../courses/test.js'
import { bakeOutline } from '../bake.js'
import { BALL_R, type Hole, type Pt, type Shape } from '../types.js'

beforeAll(() => initPhysics3d())

// A baked outline: a circle's many short rails round the cup, and a curved long edge
const shape: Shape = {
  corners: [
    [0, 0],
    [600, 0],
    [600, 2000],
    [0, 2000],
  ],
  curves: [null, { c1: [800, 600], c2: [800, 1400] }, null, null],
  circles: [{ center: [300, 0], r: 450 }],
}
const baked = bakeOutline(shape)
if (!baked.ok) throw new Error(baked.reason)
const keyhole: Hole = {
  id: 'keyhole',
  name: 'Keyhole',
  par: 2,
  outline: baked.outline,
  shape,
  walls: [],
  bumpers: [],
  slopes: [],
  tee: [300, 1700],
  cup: { at: [300, -150], r: 80 },
}

describe('3D putts stay on the course', () => {
  for (const hole of [...testCourse.holes, keyhole])
    it(hole.id, { timeout: 30_000 }, () => {
      const [cx, cy] = hole.cup.at
      const d = Math.hypot(hole.tee[0] - cx, hole.tee[1] - cy)
      const short: Pt = [cx + ((hole.tee[0] - cx) * 250) / d, cy + ((hole.tee[1] - cy) * 250) / d]
      for (const start of [hole.tee, short])
        for (let k = 0; k < 24; k++)
          for (const power of [0.3, 0.6, 1]) {
            const a = (k / 24) * 2 * Math.PI
            const r = simulateShot3d(hole, P, start, { dir: [Math.cos(a), Math.sin(a)], power })
            const shot = `from ${start.map(Math.round).join(', ')}, ${k}/24 turn, power ${power}`
            for (const p of r.path) {
              if (Math.hypot(p[0] - cx, p[1] - cy) < hole.cup.r + BALL_R) continue
              expect(pointInPolygon([p[0], p[1]], hole.outline), shot).toBe(true)
              expect(p[2]!, shot).toBeGreaterThan(heightAt(hole, [p[0], p[1]]))
            }
            if (!r.holed) expect(pointInPolygon(r.rest, hole.outline), shot).toBe(true)
          }
    })
})
