import { describe, it, expect } from 'vitest'
import { parseLabel, labelPos, nearbyPicks, checkoutHint, labelToSegment, markerPositions } from '../dartUtils.js'

describe('parseLabel', () => {
  it('parses treble', () => expect(parseLabel('T20')).toEqual({ mult: 3, num: 20, score: 60 }))
  it('parses double', () => expect(parseLabel('D5')).toEqual({ mult: 2, num: 5, score: 10 }))
  it('parses single', () => expect(parseLabel('S3')).toEqual({ mult: 1, num: 3, score: 3 }))
  it('parses outer bull', () => expect(parseLabel('25')).toEqual({ mult: 1, num: 25, score: 25 }))
  it('parses bull', () => expect(parseLabel('Bull')).toEqual({ mult: 2, num: 25, score: 50 }))
  it('parses miss', () => expect(parseLabel('Miss')).toEqual({ mult: 0, num: 0, score: 0 }))
})

describe('labelPos', () => {
  it('returns null for Miss', () => expect(labelPos('Miss')).toBeNull())
  it('returns origin for Bull', () => expect(labelPos('Bull')).toEqual({ x: 0, y: 0 }))
  it('segment 20 has x≈0 (top of board)', () => {
    const pos = labelPos('S20')!
    expect(Math.abs(pos.x)).toBeLessThan(0.01)
  })
  it('segment 20 single has negative y (top in SVG coords)', () => {
    const pos = labelPos('S20')!
    expect(pos.y).toBeLessThan(0)
  })
})

describe('nearbyPicks', () => {
  it('T20 → [S20, D20, T5, T1, S5, S1, Miss]', () => {
    expect(nearbyPicks('T20')).toEqual(['S20', 'D20', 'T5', 'T1', 'S5', 'S1', 'Miss'])
  })
  it('bull (25) uses hardcoded neighbours, not ring logic', () => {
    const picks = nearbyPicks('25')
    expect(picks).toContain('Bull')
    expect(picks).toContain('S20')
    expect(picks[picks.length - 1]).toBe('Miss')
    // Bull detected → 'Bull' added, '25' (the label) skipped = 5 items + Miss = 6
    expect(picks.length).toBe(6)
  })
  it('always has 7 results ending in Miss', () => {
    expect(nearbyPicks('D10').length).toBe(7)
    expect(nearbyPicks('D10').at(-1)).toBe('Miss')
  })
})

describe('checkoutHint', () => {
  it('direct double finish', () => expect(checkoutHint(40)).toEqual(['D20']))
  it('bull finish', () => expect(checkoutHint(50)).toEqual(['Bull']))
  it('two-dart finish', () => expect(checkoutHint(81)).toEqual(['T19', 'D12']))
  it('returns null for remaining < 2', () => expect(checkoutHint(1)).toBeNull())
  it('returns null for unfinishable score 169', () => expect(checkoutHint(169)).toBeNull())
  it('returns null for remaining 0', () => expect(checkoutHint(0)).toBeNull())
})

describe('labelToSegment', () => {
  it('maps labels to Board Manager segments', () => {
    expect(labelToSegment('T20')).toEqual({ name: 'T20', number: 20, bed: 'Triple', multiplier: 3 })
    expect(labelToSegment('D5')).toEqual({ name: 'D5', number: 5, bed: 'Double', multiplier: 2 })
    expect(labelToSegment('S3')).toEqual({ name: 'S3', number: 3, bed: 'SingleOuter', multiplier: 1 })
    expect(labelToSegment('25')).toEqual({ name: '25', number: 25, bed: 'Single', multiplier: 1 })
    expect(labelToSegment('Bull')).toEqual({ name: 'Bull', number: 50, bed: 'Double', multiplier: 1 })
    expect(labelToSegment('Miss')).toEqual({ name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 })
  })
})

describe('markerPositions', () => {
  it('puts a single marker in the middle of the outer single', () => {
    const [p] = markerPositions([20])
    expect(Math.abs(p.x)).toBeLessThan(0.001)
    expect(p.y).toBeLessThan(-0.7)
  })
  it('spreads markers on the same segment', () => {
    const [a, b, c] = markerPositions([20, 20, 6])
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.15)
    expect(c.x).toBeGreaterThan(0.7)
  })
  it('spreads markers on the bull sideways', () => {
    const [a, b] = markerPositions([50, 50])
    expect(a.y).toBeCloseTo(b.y)
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.15)
  })

  it('keeps many markers on one segment on the board', () => {
    const ps = markerPositions([1, 1, 1, 1, 1, 1, 1])
    for (const p of ps) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1)
    expect(new Set(ps.map(p => p.x.toFixed(3))).size).toBe(7)
  })
})
