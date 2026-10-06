import { describe, it, expect } from 'vitest'
import { R, SEGS, segAngle, segmentAt } from './board.js'

describe('segmentAt', () => {
  it('the bull and outer bull at the centre', () => {
    expect(segmentAt(0, 0)).toEqual({ name: 'Bull', number: 50, bed: 'Double', multiplier: 1 })
    expect(segmentAt(0, (R.bull50 + R.bull25) / 2)).toEqual({ name: '25', number: 25, bed: 'Single', multiplier: 1 })
  })

  it('treble 20, straight up (segment 0, between si and tr)', () => {
    const r = (R.si + R.tr) / 2
    const a = segAngle(0)
    const seg = segmentAt(r * Math.cos(a), r * Math.sin(a))
    expect(seg).toEqual({ name: 'T20', number: 20, bed: 'Triple', multiplier: 3 })
  })

  it('double 20, further out on the same angle', () => {
    const r = (R.so + R.db) / 2
    const a = segAngle(0)
    const seg = segmentAt(r * Math.cos(a), r * Math.sin(a))
    expect(seg).toEqual({ name: 'D20', number: 20, bed: 'Double', multiplier: 2 })
  })

  it('a point past the double wire is a miss next to the nearest number', () => {
    const a = segAngle(0)
    const seg = segmentAt(1.1 * Math.cos(a), 1.1 * Math.sin(a))
    expect(seg).toEqual({ name: 'M20', number: 20, bed: 'Outside', multiplier: 0 })
  })

  it('segment 5 (SEGS[5] = 6) resolves correctly off-axis', () => {
    const r = (R.tr + R.so) / 2
    const a = segAngle(5)
    const seg = segmentAt(r * Math.cos(a), r * Math.sin(a))
    expect(seg).toEqual({ name: 'S6', number: 6, bed: 'SingleOuter', multiplier: 1 })
  })

  it('all 20 numbers appear exactly once', () => {
    expect([...SEGS].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })
})
