import { describe, it, expect } from 'vitest'
import { R } from '../board.js'
import { DEFAULT_PHYSICS as P } from './physics.js'
import { assistDir, powerAt, shotFromDart } from './shot.js'
import type { Hole } from './types.js'

const ball = [200, 1000] as const
const cup = [200, 200] as const

describe('shotFromDart', () => {
  it('rolls up the screen for a dart straight up (the 20)', () => {
    const s = shotFromDart({ x: 0, y: 0.5 }, ball, cup, P)!
    expect(s.dir[0]).toBeCloseTo(0)
    expect(s.dir[1]).toBeCloseTo(-1)
  })
  it('rolls right for a dart in the 6', () => {
    const s = shotFromDart({ x: 0.5, y: 0 }, ball, cup, P)!
    expect(s.dir[0]).toBeCloseTo(1)
    expect(s.dir[1]).toBeCloseTo(0)
  })
  it('aims both bull rings at the cup', () => {
    const toRight = [600, 1000] as const
    for (const c of [
      { x: 0.01, y: 0.01 },
      { x: -R.bull25 * 0.9, y: 0 },
    ]) {
      const s = shotFromDart(c, ball, toRight, P)!
      expect(s.dir[0]).toBeCloseTo(1)
      expect(s.dir[1]).toBeCloseTo(0)
    }
  })
  it('putts up the screen from the bull when the ball already sits on the cup', () => {
    const s = shotFromDart({ x: 0, y: 0 }, cup, cup, P)!
    expect(s.dir).toEqual([0, -1])
    expect(Number.isNaN(s.power)).toBe(false)
  })
  it('misses outside the double wire and without coords', () => {
    expect(shotFromDart({ x: 0, y: 1.02 }, ball, cup, P)).toBeNull()
    expect(shotFromDart(null, ball, cup, P)).toBeNull()
  })
})

describe('powerAt', () => {
  it('runs from the softest putt at the centre to full power at the double wire', () => {
    expect(powerAt(0, P)).toBeCloseTo(P.minPutt)
    expect(powerAt(1, P)).toBeCloseTo(1)
    expect(powerAt(0.5, P)).toBeCloseTo(P.minPutt + (1 - P.minPutt) * 0.5)
  })
  it('bends with the ease-in curve', () => {
    expect(powerAt(0.5, { ...P, powerCurve: 'ease-in' })).toBeCloseTo(P.minPutt + (1 - P.minPutt) * 0.25)
  })
})

describe('aim assist', () => {
  // A straight lane: ball at the bottom, cup straight up
  const lane: Hole = {
    id: 'lane',
    name: 'Lane',
    par: 2,
    outline: [
      [0, 0],
      [400, 0],
      [400, 2000],
      [0, 2000],
    ],
    walls: [],
    bumpers: [],
    slopes: [],
    tee: [200, 1800],
    cup: { at: [200, 200], r: 54 },
  }
  const ball = [200, 1800] as const
  /** A unit direction `deg` degrees right of straight up. */
  const tilted = (deg: number) => [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)] as const
  const angle = (d: readonly number[]) => (Math.atan2(d[0], -d[1]) * 180) / Math.PI

  it('pulls a putt in the inner half of the window onto the cup', () => {
    expect(angle(assistDir(tilted(4), ball, lane, P))).toBeCloseTo(0)
  })
  it('nudges a putt near the edge of the window a little', () => {
    const a = angle(assistDir(tilted(8), ball, lane, P))
    expect(a).toBeGreaterThan(0.5)
    expect(a).toBeLessThan(8)
  })
  it('leaves a putt outside the window alone', () => {
    expect(angle(assistDir(tilted(14), ball, lane, P))).toBeCloseTo(14)
  })
  it('leaves the putt alone when a wall or bumper blocks the line', () => {
    const walled: Hole = {
      ...lane,
      walls: [
        {
          points: [
            [150, 1000],
            [250, 1000],
          ],
        },
      ],
    }
    const bumped: Hole = { ...lane, bumpers: [{ at: [200, 1000], r: 40 }] }
    expect(angle(assistDir(tilted(4), ball, walled, P))).toBeCloseTo(4)
    expect(angle(assistDir(tilted(4), ball, bumped, P))).toBeCloseTo(4)
  })
  it('only helps when asked, and keeps the power', () => {
    const dart = { x: 0.05, y: 0.5 }
    const plain = shotFromDart(dart, ball, lane.cup.at, P)!
    const assisted = shotFromDart(dart, ball, lane.cup.at, P, lane)!
    expect(angle(plain.dir)).toBeGreaterThan(5)
    expect(angle(assisted.dir)).toBeCloseTo(0)
    expect(assisted.power).toBe(plain.power)
  })
})
