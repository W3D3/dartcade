import { describe, it, expect } from 'vitest'
import { bedAim } from '$shared/coach/aims'
import { NOT_COUNTED } from '$shared/coach/dartClass'
import { gradeWorking, groupingLine, signedPoints, whatHappened } from './numbers'

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

  it('signs whole points', () => {
    expect(signedPoints(-4.4)).toBe('−4')
    expect(signedPoints(10.8)).toBe('+11')
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

describe('gradeWorking', () => {
  const dart = (name: string, delta: number | null, closeness: number | null = null) => ({
    name,
    bedAimId: bedAim(name)?.id ?? null,
    coords: null,
    left: 0,
    bust: false,
    class: NOT_COUNTED,
    delta,
    closeness,
  })
  const finish = {
    tag: 'setup' as const,
    left: 121,
    bust: false,
    darts: [dart('S20', -4.4), dart('M17', 10.8, 2.25), dart('S18', 1.5)],
    value: { points: 10.15, scoring: null, rule: null, startChance: 34.04, fewestChance: null },
  }

  it("adds a finish visit's darts from its start chance and places the sum in its band", () => {
    const w = gradeWorking(finish)
    expect(w.parts).toEqual(['Start: 121 left, 34.0% to check out', 'S20: Δ −4.4', 'M17: Δ +10.8, closeness +2.3', 'S18: Δ +1.5'])
    expect(w.result).toBe('Σ +10.2 → Good (+2 to +20)')
    expect(w.rule).toBeNull()
    // Bad below the lowest bound, then each class up to the next, Excellent to the end
    expect(w.scale.bands.map(b => [b.grade, b.from, b.to])).toEqual([
      ['bad', -40, -20],
      ['weak', -20, -15],
      ['inaccuracy', -15, -2],
      ['ok', -2, 2],
      ['good', 2, 20],
      ['great', 20, 60],
      ['excellent', 60, 80],
    ])
    expect(w.scale.ticks).toEqual([-20, -15, -2, 2, 20, 60])
    expect(w.scale.marker).toBe(10.15)
  })

  it("charges a bust for the visit's darts it kept from being thrown, on its own line", () => {
    const bust = { ...finish, bust: true, darts: [dart('Miss', -3), { ...dart('S10', -15), bust: true }] }
    expect(gradeWorking(bust).parts).toEqual([
      'Start: 121 left, 34.0% to check out',
      'Miss: Δ −3.0',
      'S10: Δ −15.0',
      'S10 bust: 1 dart not thrown −5.0',
    ])
    // The third dart's bust costs no dart
    const third = { ...bust, darts: [dart('Miss', -3), dart('Miss', -3), { ...dart('S10', -15), bust: true }] }
    expect(gradeWorking(third).parts.some(p => p.includes('not thrown'))).toBe(false)
  })

  it('keeps the marker on the bar, names a bust and the rule that overrode the value', () => {
    expect(gradeWorking({ ...finish, value: { ...finish.value, points: 95 } }).scale.marker).toBe(80)
    expect(gradeWorking({ ...finish, bust: true, value: { ...finish.value, points: -16 } }).result).toBe(
      'Σ −16.0 → Weak (−20 to −15) (a bust: valued back on the start)',
    )
    expect(gradeWorking({ ...finish, value: { ...finish.value, rule: 'brilliant', fewestChance: 14.2 } }).rule).toBe(
      'Brilliant: fewest darts, a 14% chance for an 81 average',
    )
    expect(gradeWorking({ ...finish, value: { ...finish.value, rule: 'fewest', fewestChance: 36 } }).rule).toBe(
      'Excellent floor: fewest darts (36% for an 81 average)',
    )
  })

  it("adds a scoring visit's rating and compares it with the average", () => {
    const w = gradeWorking({
      tag: 'scoring',
      left: 501,
      bust: false,
      darts: [],
      value: {
        points: 11.5,
        scoring: { scored: 60, grouping: 7.5, closeness: 4, rating: 71.5, average: 60 },
        rule: 'spill',
        startChance: null,
        fewestChance: null,
      },
    })
    expect(w.parts).toEqual(['Scored 60 + grouping 7.5 + closeness 4.0 = rating 71.5', 'Your average: 60.0'])
    expect(w.result).toBe('Rating − average = +11.5 → Good (+10 to +25)')
    expect(w.rule).toBe('Two or more darts spilled into 1 or 5: capped at Inaccuracy')
    expect(w.scale.ticks).toEqual([-30, -15, -5, 10, 25, 50])
  })
})
