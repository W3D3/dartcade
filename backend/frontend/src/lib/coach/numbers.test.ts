import { describe, it, expect } from 'vitest'
import { bedAim } from '$shared/coach/aims'
import { NOT_COUNTED } from '$shared/coach/dartClass'
import { groupingLine, signedPoints, valueLine, whatHappened } from './numbers'

describe('visit numbers', () => {
  const dart = (name: string, left: number, bust = false) => ({
    name,
    bedAimId: bedAim(name)?.id ?? null,
    coords: null,
    left,
    bust,
    class: NOT_COUNTED,
    delta: null,
    closeness: null,
  })

  it('lists what each dart left, a bust and a checkout', () => {
    expect(whatHappened({ darts: [dart('S19', 76), dart('T20', 16), dart('S1', 15)] })).toBe('S19 (76 left), T20 (16 left), S1 (15 left).')
    expect(whatHappened({ darts: [dart('S4', 8), dart('S10', 12, true)] })).toBe('S4 (8 left), S10 bust.')
    expect(whatHappened({ darts: [dart('S4', 4), dart('D2', 0)] })).toBe('S4 (4 left), D2 out.')
  })

  it("lists each dart's change in checkout chance and the near-miss credit", () => {
    const valued = (name: string, delta: number, closeness: number | null = null) => ({ ...dart(name, 0), delta, closeness })
    expect(valueLine({ darts: [valued('S20', -4.4), valued('T17', 10.8), valued('S18', 1.5)] })).toBe('S20 −4 · T17 +11 · S18 +2')
    expect(valueLine({ darts: [valued('M16', -3.9, 4.5), valued('M16', -6, 4.5), dart('D8', 32)] })).toBe(
      'M16 −4 · M16 −6 · near misses +9',
    )
    expect(valueLine({ darts: [dart('T20', 441)] })).toBeNull()
    expect(signedPoints(0.4)).toBe('0')
  })

  it('marks the busting dart, not the last, and the darts kept after it as not counted', () => {
    // 32 left: S16, T20 busts, D8 thrown after it (reviewLeg leaves it at the start)
    expect(whatHappened({ darts: [dart('S16', 16), dart('T20', 32, true), dart('D8', 32)] })).toBe(
      'S16 (16 left), T20 bust, D8 (not counted).',
    )
  })
})

describe('groupingLine', () => {
  const t20 = { ...NOT_COUNTED, kind: 'scoringSingle' as const, detail: null, target: { aimId: 'T20', label: 'T20' } }
  const darts = [
    { name: 'S20', bedAimId: 'SO20', coords: null, left: 481, bust: false, class: t20, delta: null, closeness: null },
    { name: 'S20', bedAimId: 'SO20', coords: { x: 0, y: 0.7 }, left: 461, bust: false, class: t20, delta: null, closeness: null },
  ]
  const g = { darts: 2, spreadMm: 6.4, offsetMm: 2.2, edgeMm: 1.4, rating: 75.3, expectedSpreadMm: 8.6, comment: null }

  it("words a visit's grouping, its target from a placed dart", () => {
    expect(groupingLine({ darts, tag: 'scoring', grouping: g })).toBe('Grouping 6 mm (yours: ~9 mm) · 2 mm off T20 · edge 1 mm · rating 75')
    expect(groupingLine({ darts, tag: 'setup', grouping: g })).toBe('Grouping 6 mm (yours: ~9 mm) · 2 mm off T20 · edge 1 mm')
  })
  it('leaves the spread out without a shared target, and is null without a grouping', () => {
    expect(groupingLine({ darts, tag: 'scoring', grouping: { ...g, spreadMm: null, offsetMm: null } })).toBe('edge 1 mm · rating 75')
    expect(groupingLine({ darts, tag: 'scoring', grouping: null })).toBeNull()
  })
})
