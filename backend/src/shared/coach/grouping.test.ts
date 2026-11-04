import { describe, it, expect } from 'vitest'
import { R, segmentAt } from '../board.js'
import { NOT_COUNTED, type DartClass } from './dartClass.js'
import {
  CLOSENESS_MAX,
  CLOSENESS_ZERO_MM,
  expectedSpreadMm,
  GOOD_GROUP_RATIO,
  GREAT_GROUP_RATIO,
  grouping,
  groupingComment,
  GROUPING_MAX,
  GROUPING_ZERO_MM,
  groupingWhy,
  SCATTERED_RATIO,
} from './grouping.js'
import { reviewLeg } from './review.js'
import { leg, visit, REF } from './testLegs.js'
import type { CoachDart, CoachVisit } from './walk.js'

const mm = (v: number) => v / 170
const T20 = { aimId: 'T20', label: 'T20' }
const MISS = { mm: 0, radialMm: 0, tangentialMm: 0, edgeMm: 0, edgeRadialMm: 0, edgeTangentialMm: 0, wedgesOff: 0 }
const placed = (x: number, y: number, edgeMm: number, target: DartClass['target'] = T20) => ({
  coords: { x, y },
  class: { ...NOT_COUNTED, target, miss: { ...MISS, edgeMm } },
})

describe('grouping', () => {
  it('needs two darts with a position and a target', () => {
    expect(grouping([placed(0, 0.6, 0)], 60, 81)).toBeNull()
    expect(
      grouping([placed(0, 0.6, 0), { coords: null, class: { ...NOT_COUNTED, target: T20, miss: { ...MISS, edgeMm: 0 } } }], 60, 81),
    ).toBeNull()
    expect(grouping([placed(0, 0.6, 0), placed(0, 0.6, 0, null)], 60, 81)).toBeNull()
  })

  it('is the spread around the centroid, its offset from the shared target and the mean edge distance', () => {
    // T20's point is (0, 0.6055); two darts 6 mm either side of a centroid 3 mm above it
    const y = 0.6055 + mm(3)
    const g = grouping([placed(-mm(6), y, 0), placed(mm(6), y, 2)], 60, 81)
    expect(g?.darts).toBe(2)
    expect(g?.spreadMm).toBeCloseTo(6, 9)
    expect(g?.offsetMm).toBeCloseTo(3, 9)
    expect(g?.edgeMm).toBe(1)
    expect(g?.rating).toBeCloseTo(60 + GROUPING_MAX * (1 - 6 / GROUPING_ZERO_MM) + CLOSENESS_MAX * (1 - 1 / CLOSENESS_ZERO_MM), 9)
  })

  it('has no spread or offset when the darts went at different targets; the closeness still counts', () => {
    const g = grouping([placed(0, 0.6, 0), placed(0.3, 0.5, 0, { aimId: 'T1', label: 'T1' })], 41, 81)
    expect(g).toMatchObject({ spreadMm: null, offsetMm: null, edgeMm: 0, rating: 41 + CLOSENESS_MAX })
  })

  it('adds nothing past the zero points', () => {
    const g = grouping([placed(0, 0.2, 50), placed(0, 0.8, 50)], 40, 81)
    expect(g?.spreadMm).toBeGreaterThan(GROUPING_ZERO_MM)
    expect(g?.rating).toBe(40)
  })

  it('says which parts earned a bonus', () => {
    expect(groupingWhy({ spreadMm: 6.2, edgeMm: 2.4, comment: { level: 'great' as const, text: 'Great grouping' } })).toBe(
      'great grouping (6 mm), close to the target (2 mm)',
    )
    expect(groupingWhy({ spreadMm: null, edgeMm: 0.2, comment: null })).toBe('on target')
    expect(groupingWhy({ spreadMm: 9, edgeMm: 45, comment: { level: 'good', text: 'Good grouping' } })).toBe('good grouping (9 mm)')
    // The text follows the comment: a group the pill calls Scattered (or nothing) isn't praised
    expect(groupingWhy({ spreadMm: 14, edgeMm: 45, comment: { level: 'scattered', text: 'Scattered' } })).toBe('')
    // A bonus too small to name: 18 mm from the treble isn't close
    expect(groupingWhy({ spreadMm: 20, edgeMm: 18, comment: null })).toBe('')
  })

  it('expects the spread a bot of the same average throws: 81 → ~10.5 mm over 3 darts (jitter included), wider lower down', () => {
    expect(expectedSpreadMm(81, 3)).toBeCloseTo(10.51, 1)
    // 2 darts sit closer to their own centroid than 3
    expect(expectedSpreadMm(81, 2)).toBeLessThan(expectedSpreadMm(81, 3))
    const avgs = [10, 30, 40, 60, 81, 100, 105, 130]
    for (let i = 1; i < avgs.length; i++) expect(expectedSpreadMm(avgs[i], 3)).toBeLessThanOrEqual(expectedSpreadMm(avgs[i - 1], 3))
    expect(expectedSpreadMm(60, 3)).toBeGreaterThan(expectedSpreadMm(81, 3))
    // Clamped outside the calibrated levels (30–105)
    expect(expectedSpreadMm(10, 3)).toBe(expectedSpreadMm(30, 3))
    expect(expectedSpreadMm(130, 3)).toBe(expectedSpreadMm(105, 3))
  })

  it('comments on the spread against the expected one: great, good, nothing, scattered', () => {
    expect(groupingComment(null, 10)).toBeNull()
    expect(groupingComment(10 * GREAT_GROUP_RATIO, 10)).toEqual({ level: 'great', text: 'Great grouping' })
    expect(groupingComment(10 * GREAT_GROUP_RATIO + 0.01, 10)).toEqual({ level: 'good', text: 'Good grouping' })
    expect(groupingComment(10 * GOOD_GROUP_RATIO, 10)).toEqual({ level: 'good', text: 'Good grouping' })
    expect(groupingComment(10 * GOOD_GROUP_RATIO + 0.01, 10)).toBeNull()
    expect(groupingComment(10 * SCATTERED_RATIO - 0.01, 10)).toBeNull()
    expect(groupingComment(10 * SCATTERED_RATIO, 10)).toEqual({ level: 'scattered', text: 'Scattered' })
  })

  it('judges the same group by the player: 13 mm is good for a 60 average, unremarkable for an 81', () => {
    // Three darts on a 13 mm circle round T20's point (0, 0.6055): each 12 mm from the centroid
    const ring = [0, 120, 240].map(deg =>
      placed(mm(13) * Math.cos((deg * Math.PI) / 180), 0.6055 + mm(13) * Math.sin((deg * Math.PI) / 180), 0),
    )
    const at60 = grouping(ring, 60, 60)
    const at81 = grouping(ring, 60, 81)
    expect(at60?.spreadMm).toBeCloseTo(13, 9)
    expect(at60?.comment).toEqual({ level: 'good', text: 'Good grouping' })
    expect(at81?.comment).toBeNull()
    expect(at81?.expectedSpreadMm).toBe(expectedSpreadMm(81, 3))
  })
})

describe('a visit rated on its score, grouping and closeness', () => {
  const at = (x: number, y: number): CoachDart => {
    const { name, number, multiplier } = segmentAt(x, y)
    return { segment: { name, number, multiplier }, coords: { x, y } }
  }
  /** Three darts 6 mm from their centroid at (0, y) */
  const cluster = (y: number) =>
    [90, 210, 330].map(t => at(mm(6) * Math.cos((t * Math.PI) / 180), y + mm(6) * Math.sin((t * Math.PI) / 180)))
  const review = (darts: readonly CoachDart[], average = 60) => {
    const scored = darts.reduce((s, d) => s + d.segment.number * d.segment.multiplier, 0)
    const v: CoachVisit = { seat: 0, darts, scored, remaining: 501 - scored, bust: false }
    return reviewLeg([leg([v])], 0, 0, { startScore: 501, average, model: REF, opponentName: () => 'Opponent' })!.visits[0]
  }
  const mid = (R.tr + R.so) / 2

  it('three clustered S20s rate above three scattered ones', () => {
    const tight = review(cluster(mid))
    const loose = review([at(-0.1, mid + 0.1235), at(0.1, mid + 0.1235), at(0.1, mid - 0.1235)])
    expect([tight, loose].map(v => v.darts.map(d => d.name))).toEqual([Array(3).fill('S20'), Array(3).fill('S20')])
    expect(tight.grouping?.spreadMm).toBeCloseTo(6, 9)
    expect(loose.grouping?.spreadMm).toBeCloseTo(25, 0)
    expect(tight.grouping!.rating).toBeGreaterThan(loose.grouping!.rating + 9)
  })

  it('S20s hugging the treble rate above S20s by the double, and lift the grade with a reason', () => {
    const hugging = review(cluster(R.tr + mm(7)))
    const outer = review(cluster(R.so - mm(7)))
    expect(hugging.grouping!.rating).toBeGreaterThan(outer.grouping!.rating + 5)
    expect(hugging).toMatchObject({ grade: 'good', text: 'Scored 60, great grouping (6 mm), close to the target (7 mm).' })
    expect(outer).toMatchObject({ grade: 'good', text: 'Scored 60, great grouping (6 mm).' })
  })

  it('a typed visit has no grouping: the rating is the score', () => {
    const v = review(visit(0, 501, ['S20', 'S20', 'S20']).darts)
    expect(v).toMatchObject({ grouping: null, grade: 'ok', text: 'Scored 60.' })
  })
})
