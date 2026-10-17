import RAPIER from '@dimforge/rapier3d-deterministic-compat'
import { beforeAll, describe, it, expect, vi } from 'vitest'
import { buildWorld, initPhysics3d, simulateShot3d } from './physics3d.js'
import { CUP_DEPTH, G, heightAt } from './ground.js'
import { DEFAULT_PHYSICS as P } from '../physics.js'
import { testCourse } from '../courses/test.js'
import { BALL_R, type Hole, type Pt } from '../types.js'

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

beforeAll(() => initPhysics3d())

describe('3D physics', () => {
  it('lays the ground out where heightAt says', () => {
    const hill: Hole = { ...lane, slopes: [{ radial: { center: [200, 2000], radius: 800, strength: 2 * P.friction } }] }
    const { world } = buildWorld(hill, P)
    world.step() // ray casts see colliders only after a step
    // The hill's top, a point on its side (off the lane's middle), flat felt
    for (const p of [
      [200, 2000],
      [100, 2300],
      [200, 3500],
    ] as Pt[]) {
      const hit = world.castRay(new RAPIER.Ray({ x: p[0] / 1000, y: 1, z: p[1] / 1000 }, { x: 0, y: -1, z: 0 }), 10, true)
      expect(hit).not.toBeNull()
      expect(Math.abs((1 - hit!.timeOfImpact) * 1000 - heightAt(hill, p))).toBeLessThan(1)
    }
    world.free()
  })

  it('rolls a flat putt its share of the full-power roll', () => {
    const r = simulateShot3d(lane, P, lane.tee, up(0.3))
    expect(lane.tee[1] - r.rest[1]).toBeGreaterThan(0.3 * P.maxRoll * 0.95)
    expect(lane.tee[1] - r.rest[1]).toBeLessThan(0.3 * P.maxRoll * 1.05)
    expect(r.holed).toBe(false)
    // Heights ride along: on flat ground the ball's centre is one radius up
    expect(r.path[r.path.length - 1][2]).toBeCloseTo(21.35, 0)
  })

  it('rolls a ball off a hill steeper than friction, by gravity alone', () => {
    const hill: Hole = { ...lane, slopes: [{ radial: { center: [200, 2000], radius: 800, strength: 2 * P.friction } }] }
    const r = simulateShot3d(hill, P, [200, 2150], up(P.minPutt))
    expect(r.rest[1]).toBeGreaterThan(2800)
  })

  it('drops a gentle putt into the cup', () => {
    const r = simulateShot3d(lane, P, [200, 600], up(320 / P.maxRoll))
    expect(r.holed).toBe(true)
    // It lies on the cup's floor
    expect(r.path[r.path.length - 1][2]).toBeCloseTo(-CUP_DEPTH + BALL_R, 0)
    expect(r.path.at(-1)).not.toEqual(r.path.at(-2)) // the path ends once
  })

  it('tips a slow putt over the rim and lets it fall, by gravity alone', () => {
    const r = simulateShot3d(lane, P, [200, 600], up(320 / P.maxRoll))
    const over = r.path.findIndex(p => Math.hypot(p[0] - 200, p[1] - 300) < 54)
    expect(over).toBeGreaterThan(0)
    const dt = 1 / 60
    for (let i = over + 1; i < r.path.length; i++) {
      const drop = r.path[i - 1][2]! - r.path[i][2]!
      // Down only, and never faster than falling from the rim since crossing it
      expect(drop, `sample ${i}`).toBeGreaterThan(-0.01)
      expect(drop, `sample ${i}`).toBeLessThanOrEqual(G * (i - over + 1) * dt * dt + 0.5)
    }
  })

  it('never changes what a ball collides with', () => {
    const set = vi.spyOn(RAPIER.Collider.prototype, 'setCollisionGroups')
    const desc = vi.spyOn(RAPIER.ColliderDesc.prototype, 'setCollisionGroups')
    simulateShot3d(lane, P, [200, 600], up(320 / P.maxRoll))
    simulateShot3d(lane, P, [200, 1500], up(0.6))
    expect(set).not.toHaveBeenCalled()
    expect(desc).not.toHaveBeenCalled()
    set.mockRestore()
    desc.mockRestore()
  })

  it('puts a ball that leaves the course back where it was putted from', () => {
    // Off the lane, over no ground: it falls, and comes back
    const r = simulateShot3d(lane, P, [600, 2000], up(0.3))
    expect(r.rest).toEqual([600, 2000])
    expect(r.holed).toBe(false)
  })

  // The cup halfway up the lane, so a putt through it has room to roll on
  const mid: Hole = { ...lane, cup: { at: [200, 2000], r: 80 } }
  /** A putt from 1500 mm short of the cup, `dx` off its line, that would roll `past` beyond it on flat felt. */
  const through = (dx: number, past: number) => simulateShot3d(mid, P, [200 + dx, 3500], up((1500 + past) / P.maxRoll))

  it('drops a putt rolling past the cup, or lets it out the far side with at most a small hop', () => {
    let missed = 0
    for (const past of [500, 1000, 2000, 2500])
      for (const dx of [0, 20, 30, 40, 50, 65, 75]) {
        const r = through(dx, past)
        if (r.holed) continue
        missed++
        const near = r.path.filter(p => Math.hypot(p[0] - 200, p[1] - 2000) < 150)
        // A ball that dipped meets the far rim's edge below its middle, and the edge turns some of
        // its speed upward: a few mm at a walk, up to about 2 cm racing through (measured 18 mm)
        const hop = past <= 1000 ? 5 : 20
        expect(Math.max(...near.map(p => p[2]!)), `${past} mm past, ${dx} off`).toBeLessThanOrEqual(BALL_R + hop)
      }
    expect(missed).toBeGreaterThan(0)
  })

  it('leaves a ball that stops short of the rim on the felt, and drops one that stops over the hole', () => {
    // On flat felt these would stop 5 mm outside the rim, and 10 mm inside it
    const noCup = { ...mid, cup: { at: [200, 300] as Pt, r: 80 } }
    const short = through(0, -85)
    expect(short.holed).toBe(false)
    const flat = simulateShot3d(noCup, P, [200, 3500], up((1500 - 85) / P.maxRoll))
    expect(Math.hypot(short.rest[0] - flat.rest[0], short.rest[1] - flat.rest[1])).toBeLessThan(1)
    expect(through(0, -70).holed).toBe(true)
  })

  it('rolls a putt too soft for a ramp back down it, and a firm one up onto the mesa', () => {
    // A mesa 150 mm up across the lane's top, its ramp running 900 mm down towards the tee
    const ramp: Hole = {
      ...lane,
      terrain: [{ mesa: { from: [0, 0], to: [400, 1500], height: 150, edges: [1, 1, 1, 900] } }],
    }
    const soft = simulateShot3d(ramp, P, [200, 3000], up(1200 / P.maxRoll))
    expect(soft.rest[1]).toBeGreaterThan(2400)
    const firm = simulateShot3d(ramp, P, [200, 3000], up(0.75))
    expect(firm.rest[1]).toBeLessThan(1500)
  })

  it('holes a ball only over the cup, even when the cup sits up on a mesa', () => {
    const raised: Hole = { ...lane, terrain: [{ mesa: { from: [0, 0], to: [400, 800], height: 150, edges: [1, 1, 1, 900] } }] }
    expect(simulateShot3d(raised, P, [200, 3000], up(0.2)).holed).toBe(false)
  })

  it('lets a ball on ground gentler than friction stay put, and ends a shot on a steep ramp', () => {
    const gentle: Hole = { ...lane, slopes: [{ radial: { center: [200, 2000], radius: 800, strength: P.friction / 2 } }] }
    const r = simulateShot3d(gentle, P, [200, 2300], up(P.minPutt))
    // Uphill, friction plus the slope's half-friction stop it in a third less than on flat felt; then it stays
    expect(Math.abs(r.rest[1] - (2300 - (P.minPutt * P.maxRoll) / 1.5))).toBeLessThan(40)
    const steep: Hole = { ...lane, terrain: [{ mesa: { from: [0, 0], to: [400, 1500], height: 300, edges: [1, 1, 1, 900] } }] }
    expect(simulateShot3d(steep, P, [200, 1800], up(P.minPutt)).rest[1]).toBeGreaterThan(2400)
  })

  it('rests a ball that stopped at the foot of a ramp, though the ramp under its centre is steep', () => {
    // Up the Mesa's ramp, too soft: it rolls back and stops on flat felt, its centre still over the ramp
    const mesa = testCourse.holes.find(h => h.id === 'test-mesa')!
    const r = simulateShot3d(mesa, P, mesa.tee, up(0.22))
    expect(r.path.length).toBeLessThan(3 * 60)
    let still = 0
    for (let i = r.path.length - 1; i > 0 && Math.hypot(r.path[i][0] - r.path[i - 1][0], r.path[i][1] - r.path[i - 1][1]) < 0.2; i--)
      still++
    expect(still).toBeLessThanOrEqual(0.25 * 60)
  })

  it('knocks another ball, and reports where it went', () => {
    const r = simulateShot3d(lane, P, [200, 3000], up(0.3), [{ id: 1, at: [200, 2600] }])
    expect(r.others?.[0].id).toBe(1)
    expect(r.others?.[0].rest[1]).toBeLessThan(2600)
    expect(r.hits.length).toBeGreaterThan(0)
  })

  it('drops a knocked ball into the cup', () => {
    const r = simulateShot3d(lane, P, [200, 600], up(500 / P.maxRoll), [{ id: 1, at: [200, 420] }])
    expect(r.others?.[0].holed).toBe(true)
  })

  it('lists only the balls a putt moved', () => {
    const r = simulateShot3d(lane, P, [200, 3000], up(0.1), [{ id: 1, at: [100, 1000] }])
    expect(r.others).toEqual([])
  })

  it('kicks the ball off a bumper faster than it came', () => {
    const kicker: Hole = { ...lane, bumpers: [{ at: [200, 2500], r: 60, kick: 800 }] }
    const plain: Hole = { ...lane, bumpers: [{ at: [200, 2500], r: 60 }] }
    const shot = up(0.25)
    expect(simulateShot3d(kicker, P, [200, 3000], shot).rest[1]).toBeGreaterThan(simulateShot3d(plain, P, [200, 3000], shot).rest[1])
  })

  it('bounces off a thicker wall sooner than a thin one', () => {
    const start: Pt = [200, 3800]
    const wallY = start[1] - 300 // 300 mm away along the lane
    const wallAt = (thickness: number): Hole => ({
      ...lane,
      walls: [
        {
          points: [
            [0, wallY],
            [400, wallY],
          ],
          thickness,
        },
      ],
    })
    const turnY = (thickness: number) => Math.min(...simulateShot3d(wallAt(thickness), P, start, up(0.3)).path.map(p => p[1]))
    expect(turnY(200)).toBeGreaterThan(turnY(12) + 50)
  })

  it('records a hit on the rail, and carries heights in the path', () => {
    const r = simulateShot3d(lane, P, [100, 600], up(0.4)) // beside the cup
    expect(r.hits.length).toBeGreaterThan(0)
    expect(r.path.every(p => p.length === 3)).toBe(true)
  })

  it('plays the same shot the same way twice, bit for bit', () => {
    const hole = testCourse.holes[2]
    const shot = () => simulateShot3d(hole, P, hole.tee, { dir: [0.3, -0.95], power: 0.8 }, [{ id: 1, at: [960, 2160] }])
    const a = shot()
    expect(a.others?.length).toBe(1) // the putt knocks it
    expect(shot()).toEqual(a)
  })

  it('throws before Rapier is loaded', async () => {
    vi.resetModules()
    const fresh = await import('./physics3d.js')
    expect(() => fresh.simulateShot3d(lane, P, lane.tee, up(0.1))).toThrow('initPhysics3d')
  })
})
