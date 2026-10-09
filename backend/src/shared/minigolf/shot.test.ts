import { describe, it, expect } from 'vitest'
import { R } from '../board.js'
import { DEFAULT_PHYSICS as P } from './physics.js'
import { powerAt, shotFromDart } from './shot.js'

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
