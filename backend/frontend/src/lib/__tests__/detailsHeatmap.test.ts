import { describe, it, expect } from 'vitest'
import type { X01Detail } from '../api'
import {
  BOARD_VIEW_HALF,
  boardLabel,
  clampToView,
  groupingMm,
  heatSummary,
  inThe20,
  missSide,
  mostHit,
  seatDarts,
  toBoardPx,
  trebles,
  type HeatDart,
} from '../details/heatmap.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3) => ({
  name,
  number,
  multiplier,
  bed: (multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single') as 'Single',
})
// Most calls only care about coords; defaulting `manual` to "no coords" preserves the old
// hand-entered-looking fixtures, while a camera bounce-out (no coords, not manual) is spelled
// out explicitly with the third argument.
const d = (s: ReturnType<typeof seg>, coords: { x: number; y: number } | null = null, manual = coords === null): HeatDart => ({
  segment: s,
  coords,
  manual,
})
const S20 = seg('S20', 20, 1),
  T20 = seg('T20', 20, 3),
  D20 = seg('D20', 20, 2),
  S1 = seg('S1', 1, 1),
  S18 = seg('S18', 18, 1),
  S5 = seg('S5', 5, 1),
  T19 = seg('T19', 19, 3),
  BULL = seg('Bull', 50, 1),
  B25 = seg('25', 25, 1),
  MISS = seg('Miss', 0, 0),
  M20 = seg('M20', 20, 0)

describe('heatmap helpers', () => {
  it("collects a seat's darts across legs", () => {
    const hd = (s: ReturnType<typeof seg>, coords: { x: number; y: number } | null) => ({
      index: 0,
      segment: s,
      coords,
      source: 'camera' as const,
      corrected: false,
      thrownAt: '',
    })
    const v = (seat: number, darts: ReturnType<typeof hd>[]) => ({
      visit: 0,
      seat,
      committedAt: '',
      darts,
      scored: 0,
      remaining: 0,
      bust: false,
    })
    const detail = {
      mode: 'x01',
      legs: [
        { leg: 0, starter: 0, winner: 0, visits: [v(0, [hd(S20, { x: 0, y: 0.8 })]), v(1, [hd(S1, null)])] },
        { leg: 1, starter: 1, winner: null, visits: [v(0, [hd(T20, null), hd(S5, { x: -0.1, y: 0.7 })])] },
      ],
    } as X01Detail
    expect(seatDarts(detail, 0).map(x => x.segment.name)).toEqual(['S20', 'T20', 'S5'])
    expect(seatDarts(detail, 0)[1].coords).toBeNull()
    expect(seatDarts(detail, 2)).toEqual([])
  })

  it('counts darts in the 20, misses excluded from the 20 but in the total', () => {
    expect(inThe20([d(S20), d(T20), d(D20), d(S1), d(M20)])).toEqual({ pct: 60, hits: 3, total: 5 })
    expect(inThe20([])).toEqual({ pct: null, hits: 0, total: 0 })
  })

  it('counts trebles and the most common one', () => {
    expect(trebles([d(T20), d(T20), d(T19), d(S20)])).toEqual({ count: 3, top: { label: 'T20', n: 2 } })
    expect(trebles([d(S20)])).toEqual({ count: 0, top: null })
    expect(trebles([])).toEqual({ count: 0, top: null })
  })

  it('compares the miss sides around the 20', () => {
    expect(missSide([d(S1), d(S18), d(S5)])).toEqual({ side: 'Right', right: 2, left: 1 })
    expect(missSide([d(S1), d(S5)])).toEqual({ side: 'Even', right: 1, left: 1 })
    expect(missSide([d(S20)])).toEqual({ side: null, right: 0, left: 0 })
    expect(missSide([])).toEqual({ side: null, right: 0, left: 0 })
  })

  it('measures the grouping in mm from positioned darts only', () => {
    // Three darts 0.1 board units (17 mm) from their centre at (0, 0.8)
    const g = groupingMm([
      d(S20, { x: 0, y: 0.9 }),
      d(S20, { x: 0, y: 0.7 }),
      d(S20, { x: 0.1, y: 0.8 }),
      d(S20, { x: -0.1, y: 0.8 }),
      d(T20),
    ])
    expect(g).toBeCloseTo(17)
    expect(groupingMm([d(S20, { x: 0, y: 0.8 }), d(S20, { x: 0, y: 0.7 })])).toBeNull()
    // Three positioned darts at distance 0.1 from centroid
    const three = groupingMm([d(S20, { x: 0, y: 0.9 }), d(S20, { x: 0.0866, y: 0.75 }), d(S20, { x: -0.0866, y: 0.75 })])
    expect(three).toBeCloseTo(17, 0)
    expect(groupingMm([])).toBeNull()
  })

  it('lists the most hit segments without misses, bulls labelled', () => {
    expect(mostHit([d(S20), d(S20), d(BULL), d(B25), d(B25), d(MISS), d(MISS), d(MISS)], 3)).toEqual([
      { label: 'S20', n: 2 },
      { label: '25', n: 2 },
      { label: 'Bull', n: 1 },
    ])
    expect(mostHit([])).toEqual([])
  })

  it('writes the summary line and the board label', () => {
    const darts = [d(S20, { x: 0, y: 0.8 }), d(T20), d(S5)]
    expect(heatSummary('Christoph', 4, darts)).toBe('Christoph · All 4 legs · 3 darts · 2 entered by hand, not on the board')
    expect(heatSummary('Christoph', 1, [d(S20, { x: 0, y: 0.8 })])).toBe('Christoph · 1 leg · 1 dart')
    expect(boardLabel('Christoph', darts)).toBe('Heatmap of 1 dart position for Christoph; most hit S20, T20, S5')
    expect(boardLabel('Guest 1', [d(S20)])).toBe('No dart positions for Guest 1')
  })

  it('a bounce-out (camera, no coords) is not reported as entered by hand', () => {
    // M20 here stands in for a bounce-out: a camera dart (manual: false) with no coords.
    const darts = [d(S20, { x: 0, y: 0.8 }), d(M20, null, false)]
    expect(heatSummary('Christoph', 1, darts)).toBe('Christoph · 1 leg · 2 darts')
    // Mixed with an actual hand-entered dart, only the manual one is counted.
    const mixed = [d(S20, { x: 0, y: 0.8 }), d(M20, null, false), d(T19, null, true)]
    expect(heatSummary('Christoph', 1, mixed)).toBe('Christoph · 1 leg · 3 darts · 1 entered by hand, not on the board')
  })

  it('a forfeit before any visit: no legs and no darts reads as "No darts thrown"', () => {
    expect(heatSummary('A', 0, [])).toBe('A · No darts thrown')
    expect(boardLabel('A', [])).toBe('No darts thrown for A')
  })

  it('clamps a point beyond the viewBox to its rim, direction preserved', () => {
    const inside = { x: 50, y: 60 }
    expect(clampToView(inside)).toEqual(inside)
    const onRim = { x: BOARD_VIEW_HALF, y: 0 }
    expect(clampToView(onRim)).toEqual(onRim)
    const far = { x: BOARD_VIEW_HALF * 2, y: 0 }
    expect(clampToView(far)).toEqual({ x: BOARD_VIEW_HALF, y: 0 })
    const diag = { x: 300, y: 400 } // r = 500
    const clamped = clampToView(diag)
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(BOARD_VIEW_HALF)
    expect(clamped.x / clamped.y).toBeCloseTo(diag.x / diag.y)
    expect(clampToView({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('the viewBox half is wide enough for a near miss up to r ≈ 1.35', () => {
    // toBoardPx's mm-per-unit scaling; r = 1 is the outer double wire.
    const wideMiss = toBoardPx({ x: 1.35, y: 0 })
    expect(Math.hypot(wideMiss.x, wideMiss.y)).toBeLessThanOrEqual(BOARD_VIEW_HALF)
    expect(clampToView(wideMiss)).toEqual(wideMiss)
  })

  it('maps board units to SVG units, y up', () => {
    const right = toBoardPx({ x: 1, y: 0 }),
      top = toBoardPx({ x: 0, y: 1 })
    expect([right.x, right.y + 0]).toEqual([170, 0])
    expect([top.x + 0, top.y]).toEqual([0, -170])
  })
})
