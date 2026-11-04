import { describe, it, expect } from 'vitest'
import { bedAim } from '$shared/coach/aims'
import { NOT_COUNTED } from '$shared/coach/dartClass'
import { FINISH_SCALE, SCORING_SCALE } from '$shared/coach/grade'
import { bandText, gradeWorking, groupingLine, scaleText, signedPoints, whatHappened } from './numbers'

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

  it('signs points, whole or to a decimal', () => {
    expect(signedPoints(-4.4)).toBe('−4')
    expect(signedPoints(10.8)).toBe('+11')
    expect(signedPoints(0.4)).toBe('0')
    expect(signedPoints(-4.44, 1)).toBe('−4.4')
    expect(signedPoints(-0.04, 1)).toBe('0.0')
  })

  it("words a grade's band on a complete scale, Bad below the last bound", () => {
    expect(bandText(FINISH_SCALE, 'excellent')).toBe('+60 or more')
    expect(bandText(FINISH_SCALE, 'good')).toBe('+2 to +20')
    expect(bandText(FINISH_SCALE, 'bad')).toBe('below −20')
    expect(scaleText(SCORING_SCALE)).toMatch(/^Excellent \+50 or more, .*, Bad below −30$/)
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
    expect(groupingLine({ darts, tag: 'scoring', grouping: g })).toBe(
      'Grouping 6 mm (target: ~9 mm) · 2 mm off T20 · edge 1 mm · rating 75',
    )
    expect(groupingLine({ darts, tag: 'setup', grouping: g })).toBe('Grouping 6 mm (target: ~9 mm) · 2 mm off T20 · edge 1 mm')
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
  const term = (delta: number, closeness: number | null = null, penalty = 0) => ({ delta, closeness, penalty })
  const finish = {
    left: 121,
    bust: false,
    darts: [dart('S20', -4.4), dart('M17', 10.8, 2.25), dart('S18', 1.5)],
    value: {
      points: 10.15,
      scoring: null,
      terms: [term(-4.4), term(10.8, 2.25), term(1.5)],
      band: 'good' as const,
      bands: FINISH_SCALE,
      rule: null,
      startChance: 34.04,
      fewestChance: null,
    },
  }

  /** A point's place on the finish scale's bar (−40 to +80), in % */
  const at = (p: number) => ((p + 40) / 120) * 100

  it("adds a finish visit's darts from its start chance and places the sum in its band", () => {
    const w = gradeWorking(finish)
    expect(w.parts).toEqual(['Start: 121 left, 34.0% to check out', 'S20: Δ −4.4', 'M17: Δ +10.8, closeness +2.3', 'S18: Δ +1.5'])
    expect(w.result).toBe('Σ +10.2 → Good (+2 to +20)')
    expect(w.rule).toBeNull()
    // Bad from the bar's start (20 below the lowest bound) up, Excellent to its end (20 above the highest)
    expect(w.scale.bands.map(b => [b.grade, b.left, b.width])).toEqual([
      ['excellent', at(60), at(80) - at(60)],
      ['great', at(20), at(60) - at(20)],
      ['good', at(2), at(20) - at(2)],
      ['ok', at(-2), at(2) - at(-2)],
      ['inaccuracy', at(-15), at(-2) - at(-15)],
      ['weak', at(-20), at(-15) - at(-20)],
      ['bad', 0, at(-20)],
    ])
    expect(w.scale.ticks.map(t => t.label)).toEqual(['−20', '−15', '−2', '+2', '+20', '+60'])
    expect(w.scale.ticks[0].left).toBe(at(-20))
    expect(w.scale.marker).toBe(at(10.15))
  })

  it("charges a bust for the visit's darts it kept from being thrown, on its own line", () => {
    const bust = {
      ...finish,
      bust: true,
      darts: [dart('Miss', -3), { ...dart('S10', -15), bust: true }],
      value: { ...finish.value, terms: [term(-3), term(-15, null, 5)] },
    }
    expect(gradeWorking(bust).parts).toEqual([
      'Start: 121 left, 34.0% to check out',
      'Miss: Δ −3.0',
      'S10: Δ −15.0',
      'S10 bust: 1 dart not thrown −5.0',
    ])
    // The third dart's bust costs no dart
    const third = {
      ...bust,
      darts: [dart('Miss', -3), dart('Miss', -3), { ...dart('S10', -15), bust: true }],
      value: { ...bust.value, terms: [term(-3), term(-3), term(-15)] },
    }
    expect(gradeWorking(third).parts.some(p => p.includes('not thrown'))).toBe(false)
  })

  it('keeps the marker on the bar, names a bust and the rule that overrode the value', () => {
    expect(gradeWorking({ ...finish, value: { ...finish.value, points: 95 } }).scale.marker).toBe(100)
    expect(gradeWorking({ ...finish, bust: true, value: { ...finish.value, points: -16, band: 'weak' } }).result).toBe(
      'Σ −16.0 → Weak (−20 to −15) (a bust: valued back on the start)',
    )
    expect(gradeWorking({ ...finish, value: { ...finish.value, rule: 'brilliant', fewestChance: 14.2 } }).rule).toBe(
      'Brilliant: fewest darts, a 14% chance for a semi-pro',
    )
    expect(gradeWorking({ ...finish, value: { ...finish.value, rule: 'fewest', fewestChance: 36 } }).rule).toBe(
      'Excellent floor: fewest darts (36% for a semi-pro)',
    )
  })

  it("adds a scoring visit's rating and compares it with the average", () => {
    const w = gradeWorking({
      left: 501,
      bust: false,
      darts: [],
      value: {
        points: 11.5,
        scoring: { scored: 60, grouping: 7.5, closeness: 4, rating: 71.5, average: 60 },
        terms: [],
        band: 'good',
        bands: SCORING_SCALE,
        rule: 'spill',
        startChance: null,
        fewestChance: null,
      },
    })
    expect(w.parts).toEqual(['Scored 60 + grouping 7.5 + closeness 4.0 = rating 71.5', 'Your average: 60.0'])
    expect(w.result).toBe('Rating − average = +11.5 → Good (+10 to +25)')
    expect(w.rule).toBe('Two or more darts spilled into 1 or 5: capped at Inaccuracy')
    expect(w.scale.ticks.map(t => t.label)).toEqual(['−30', '−15', '−5', '+10', '+25', '+50'])
  })
})
