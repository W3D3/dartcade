import { describe, it, expect } from 'vitest'
import { pickTarget, throwAt } from './accuracy.js'
import { R, segAngle, segmentAt } from '../shared/board.js'

describe('pickTarget', () => {
  it('aims at treble 20 while no finish is on', () => {
    const t = pickTarget(501, 3, 'double')
    const want = { r: (R.si + R.tr) / 2, a: segAngle(0) } // SEGS[0] === 20
    expect(t.x).toBeCloseTo(want.r * Math.cos(want.a), 6)
    expect(t.y).toBeCloseTo(want.r * Math.sin(want.a), 6)
  })

  it('aims at the suggested checkout double once one is reachable', () => {
    // 40 left, double out, 3 darts: checkoutHint gives D20 direct
    const t = pickTarget(40, 3, 'double')
    const seg = segmentAt(t.x, t.y)
    expect(seg.name).toBe('D20')
  })

  it('aims at the bull for a 50 finish', () => {
    const t = pickTarget(50, 1, 'double')
    expect(segmentAt(t.x, t.y).name).toBe('Bull')
  })

  it('falls back to treble 20 when no finish fits the darts left', () => {
    // 169: can't be finished in 3 darts (not in the table, and > 40 so no direct double)
    const t = pickTarget(169, 3, 'double')
    expect(segmentAt(t.x, t.y).name).toBe('T20')
  })

  it('aims at D20 instead of treble 20 while not yet opened under double-in', () => {
    // 501, unopened, double check-in: a dart at T20 never counts, so it must aim at a double
    const t = pickTarget(501, 3, 'double', { opened: false, inMode: 'double' })
    expect(segmentAt(t.x, t.y).name).toBe('D20')
  })

  it('aims at treble 20 once opened, even under double-in', () => {
    const t = pickTarget(501, 3, 'double', { opened: true, inMode: 'double' })
    expect(segmentAt(t.x, t.y).name).toBe('T20')
  })

  it('aims at treble 20 while unopened under master-in: a treble already counts', () => {
    const t = pickTarget(501, 3, 'double', { opened: false, inMode: 'master' })
    expect(segmentAt(t.x, t.y).name).toBe('T20')
  })

  it('without opening info (calibration, straight-in callers) behaves exactly as before', () => {
    const t = pickTarget(501, 3, 'double')
    expect(segmentAt(t.x, t.y).name).toBe('T20')
  })
})

describe('throwAt', () => {
  it('a sigma of 0 always lands exactly on the target', () => {
    const target = { x: 0.1, y: 0.2 }
    const rng = () => 0.5 // any fixed value; with sigma 0 the offset is always (0, 0)
    const { segment, coords } = throwAt(target, 0, rng)
    expect(segment).toEqual(segmentAt(target.x, target.y))
    expect(coords).toEqual(target)
  })

  it('consumes exactly two rng() calls per throw (one Gaussian pair via Box-Muller)', () => {
    let calls = 0
    const rng = () => {
      calls++
      return 0.5
    }
    throwAt({ x: 0, y: 0 }, 0.05, rng)
    expect(calls).toBe(2)
  })

  it('a larger sigma produces a wider spread of outcomes over many throws', () => {
    const target = { x: 0, y: (R.si + R.tr) / 2 } // aimed at the 20's treble, straight up
    let seed = 1
    const rng = () => {
      // a simple deterministic sequence, not cryptographically random, just varied
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const tight = new Set(Array.from({ length: 200 }, () => throwAt(target, 0.01, rng).segment.name))
    const wide = new Set(Array.from({ length: 200 }, () => throwAt(target, 0.15, rng).segment.name))
    expect(wide.size).toBeGreaterThan(tight.size)
  })
})
