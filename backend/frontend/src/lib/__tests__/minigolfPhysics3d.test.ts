import { beforeAll, describe, it, expect } from 'vitest'
import { loadPhysics3d, type Simulate3d } from '$lib/minigolf/3d/physics3d'
import { DEFAULT_PHYSICS as P } from '$shared/minigolf/physics'
import type { Hole } from '$shared/minigolf/types'

const lane: Hole = {
  id: 'lane',
  name: 'Lane',
  par: 2,
  outline: [
    [0, 0],
    [400, 0],
    [400, 4000],
    [0, 4000],
  ],
  walls: [],
  bumpers: [],
  slopes: [],
  tee: [200, 3800],
  cup: { at: [200, 300], r: 54 },
}
const up = (power: number) => ({ dir: [0, -1] as const, power })

let simulate: Simulate3d
beforeAll(async () => {
  simulate = await loadPhysics3d()
})

describe('3D physics', () => {
  it('rolls a flat putt as far as the 2D physics does', () => {
    const r = simulate(lane, P, lane.tee, up(0.3))
    expect(lane.tee[1] - r.rest[1]).toBeGreaterThan(0.3 * P.maxRoll * 0.95)
    expect(lane.tee[1] - r.rest[1]).toBeLessThan(0.3 * P.maxRoll * 1.05)
    expect(r.holed).toBe(false)
    // Heights ride along: on flat ground the ball's centre is one radius up
    expect(r.path[r.path.length - 1][2]).toBeCloseTo(21.35, 0)
  })

  it('rolls a ball off a hill steeper than friction, by gravity alone', () => {
    const hill: Hole = { ...lane, slopes: [{ radial: { center: [200, 2000], radius: 800, strength: 2 * P.friction } }] }
    const r = simulate(hill, P, [200, 2150], up(P.minPutt))
    expect(r.rest[1]).toBeGreaterThan(2800)
  })

  it('drops a gentle putt into the cup', () => {
    const r = simulate(lane, P, [200, 600], up(320 / P.maxRoll))
    expect(r.holed).toBe(true)
    expect(r.path[r.path.length - 1][2]).toBeLessThan(0)
  })

  it('rolls a putt too soft for a ramp back down it, and a firm one up onto the mesa', () => {
    // A mesa 150 mm up across the lane's top, its ramp running 900 mm down towards the tee
    const ramp: Hole = {
      ...lane,
      terrain: [{ mesa: { from: [0, 0], to: [400, 1500], height: 150, edges: [1, 1, 1, 900] } }],
    }
    const soft = simulate(ramp, P, [200, 3000], up(1200 / P.maxRoll))
    expect(soft.rest[1]).toBeGreaterThan(2400)
    const firm = simulate(ramp, P, [200, 3000], up(0.75))
    expect(firm.rest[1]).toBeLessThan(1500)
  })
})
