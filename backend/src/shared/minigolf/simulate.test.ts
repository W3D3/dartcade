import { describe, it, expect } from 'vitest'
import { DEFAULT_PHYSICS as P } from './physics.js'
import { simulateShot } from './simulate.js'
import type { Hole } from './types.js'

// A long, empty lane: 400 wide, 4000 long
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
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('simulateShot', () => {
  it('rolls its share of the full-power distance', () => {
    const soft = simulateShot(lane, P, lane.tee, up(0.2))
    expect(lane.tee[1] - soft.rest[1]).toBeCloseTo(0.2 * P.maxRoll, -1)
    const hard = simulateShot(lane, P, lane.tee, up(0.4))
    expect(hard.rest[1]).toBeLessThan(soft.rest[1])
    expect(soft.holed).toBe(false)
  })

  it('starts the path at the ball and ends it at rest', () => {
    const r = simulateShot(lane, P, lane.tee, up(0.2))
    expect(r.path[0]).toEqual(lane.tee)
    expect(r.path.at(-1)).toEqual(r.rest)
  })

  it('banks off a rail at the mirrored angle', () => {
    // Heading up-right at 45°, hits the right rail, comes back up-left
    const r = simulateShot(lane, { ...P, wallRestitution: 1 }, [200, 3800], { dir: [Math.SQRT1_2, -Math.SQRT1_2], power: 0.5 })
    const hit = r.path.findIndex(p => p[0] > 400 - 21.35 - P.wallThickness / 2 - 2)
    expect(hit).toBeGreaterThan(0)
    const after = r.path[hit + 10]
    const at = r.path[hit]
    expect(after[0]).toBeLessThan(at[0]) // now moving left
    expect(at[1] - after[1]).toBeGreaterThan(0) // still moving up
    expect(Math.abs(at[0] - after[0] - (at[1] - after[1]))).toBeLessThan(15) // about 45° again
  })

  it('never passes through a thin wall, even at full power', () => {
    const walled: Hole = {
      ...lane,
      walls: [
        {
          points: [
            [0, 2000],
            [400, 2000],
          ],
        },
      ],
    }
    const r = simulateShot(walled, { ...P, maxRoll: 700_000 }, lane.tee, up(1))
    expect(r.path.every(p => p[1] > 2000)).toBe(true)
  })

  it('bends the path on a slope', () => {
    const sloped: Hole = {
      ...lane,
      slopes: [
        {
          area: [
            [0, 1000],
            [400, 1000],
            [400, 3000],
            [0, 3000],
          ],
          force: [300, 0],
        },
      ],
    }
    const r = simulateShot(sloped, P, lane.tee, up(0.5))
    expect(r.rest[0]).toBeGreaterThan(220)
  })

  it('keeps rolling on a slope stronger than friction', () => {
    const steep: Hole = {
      ...lane,
      slopes: [
        {
          area: [
            [0, 0],
            [400, 0],
            [400, 4000],
            [0, 4000],
          ],
          force: [0, -2 * P.friction],
        },
      ],
    }
    const r = simulateShot(steep, P, [200, 3000], up(0.01))
    expect(r.rest[1]).toBeLessThan(2000)
  })

  it('rolls a ball off a summit steeper than friction', () => {
    const summit: Hole = { ...lane, slopes: [{ area: lane.outline, radial: { center: [200, 2000], strength: 2 * P.friction } }] }
    const r = simulateShot(summit, P, [200, 2100], up(P.minPutt))
    expect(r.rest[1]).toBeGreaterThan(2100)
  })

  it('drops a slow ball into the cup and lets a fast one roll over', () => {
    const slow = (lane.tee[1] - lane.cup.at[1] - 20) / P.maxRoll
    const holed = simulateShot(lane, P, lane.tee, up(slow))
    expect(holed.holed).toBe(true)
    expect(holed.rest).toEqual(lane.cup.at)
    // A dead rail behind the cup, so the ball can't come back over it
    const fast = simulateShot(lane, { ...P, wallRestitution: 0 }, [200, 600], up(0.9))
    expect(fast.holed).toBe(false)
  })

  it('kicks the ball off a bumper', () => {
    const bumped: Hole = { ...lane, bumpers: [{ at: [200, 2500], r: 40, restitution: 1, kick: 0 }] }
    const kicked: Hole = { ...lane, bumpers: [{ at: [200, 2500], r: 40, restitution: 1, kick: 1500 }] }
    const a = simulateShot(bumped, P, lane.tee, up(0.4))
    const b = simulateShot(kicked, P, lane.tee, up(0.4))
    // How far the ball gets in the quarter second after it turns at the bumper
    const backAfterTurn = (r: { path: readonly (readonly number[])[] }) => {
      const turn = r.path.findIndex((p, i) => i > 0 && i + 1 < r.path.length && r.path[i + 1][1] > p[1])
      return r.path[turn + 15][1] - r.path[turn][1]
    }
    expect(backAfterTurn(b)).toBeGreaterThan(backAfterTurn(a) + 200) // the kick sends it back faster
  })

  it('always ends: a ball pinned in a corner stops at the time cap', () => {
    const r = simulateShot(lane, { ...P, friction: 0, maxTime: 2 }, [200, 200], { dir: [Math.SQRT1_2, Math.SQRT1_2], power: 0.3 })
    expect(r.path.length).toBeLessThanOrEqual(2 * 60 + 2)
  })

  it('gives the same result for the same input', () => {
    const a = simulateShot(lane, P, lane.tee, { dir: [0.3, -0.954], power: 0.7 })
    const b = simulateShot(lane, P, lane.tee, { dir: [0.3, -0.954], power: 0.7 })
    expect(b).toEqual(a)
    expect(dist(a.rest, a.path.at(-1)!)).toBe(0)
  })

  it('knocks a ball in the way and passes on most of its speed', () => {
    const r = simulateShot(lane, P, [200, 3000], up(0.4), [
      { id: 2, at: [200, 2500] },
      { id: 3, at: [50, 3500] },
    ])
    expect(r.others?.map(o => o.id)).toEqual([2]) // the ball off to the side didn't move
    const knocked = r.others![0]
    expect(knocked.rest[1]).toBeLessThan(2500 - 300)
    expect(r.rest[1]).toBeGreaterThan(knocked.rest[1])
    expect(knocked.path.length).toBeLessThanOrEqual(r.path.length + 1)
  })

  it('knocks a ball into the cup', () => {
    const r = simulateShot(lane, P, [200, 900], up(700 / P.maxRoll), [{ id: 2, at: [200, 420] }])
    expect(r.others?.[0]).toMatchObject({ id: 2, holed: true, rest: lane.cup.at })
  })

  it('lists no others when none were passed', () => {
    expect(simulateShot(lane, P, lane.tee, up(0.3)).others).toBeUndefined()
  })

  it('drops a ball crossing the middle of the cup faster than one clipping its rim', () => {
    // Crosses the cup at 1.6 m/s: straight over its middle, then 45 mm off it (a short way across)
    const roll = 1600 ** 2 / (2 * P.friction)
    const power = (lane.tee[1] - lane.cup.at[1] + roll) / P.maxRoll
    const dead = { ...P, wallRestitution: 0 } // no second pass after the rail behind the cup
    expect(simulateShot(lane, dead, lane.tee, up(power)).holed).toBe(true)
    expect(simulateShot(lane, dead, [lane.tee[0] + 45, lane.tee[1]], up(power)).holed).toBe(false)
  })

  it('bends a ball clipping the rim towards the cup', () => {
    const roll = 1600 ** 2 / (2 * P.friction)
    const power = (lane.tee[1] - lane.cup.at[1] + roll) / P.maxRoll
    const r = simulateShot(lane, { ...P, wallRestitution: 0 }, [lane.tee[0] + 45, lane.tee[1]], up(power))
    // It went in straight at x = 245 and left the cup pulled towards its middle (x = 200)
    const past = r.path.find(p => p[1] < lane.cup.at[1] - lane.cup.r - 30)
    expect(past![0]).toBeLessThan(lane.tee[0] + 45 - 2)
  })

  it('pulls a ball that stops on the rim into the cup, without a jump', () => {
    // Just enough to stop 40 mm short of the cup's middle, inside its rim
    const power = (lane.tee[1] - lane.cup.at[1] - 40) / P.maxRoll
    const r = simulateShot(lane, P, lane.tee, up(power))
    expect(r.holed).toBe(true)
    const steps = r.path.slice(1).map((p, i) => Math.hypot(p[0] - r.path[i][0], p[1] - r.path[i][1]))
    expect(Math.max(...steps.slice(-8))).toBeLessThan(25)
  })
})
