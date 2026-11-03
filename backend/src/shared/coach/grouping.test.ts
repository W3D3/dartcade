import { describe, it, expect } from 'vitest'
import { R, segmentAt } from '../board.js'
import { NOT_COUNTED, type DartClass } from './dartClass.js'
import { CLOSENESS_MAX, CLOSENESS_ZERO_MM, grouping, GROUPING_MAX, GROUPING_ZERO_MM, groupingWhy } from './grouping.js'
import { reviewLeg } from './review.js'
import { leg, visit } from './testLegs.js'
import type { CoachDart, CoachVisit } from './walk.js'

const mm = (v: number) => v / 170
const T20 = { aimId: 'T20', label: 'T20' }
const placed = (x: number, y: number, edgeMm: number, target: DartClass['target'] = T20) => ({
  coords: { x, y },
  class: { ...NOT_COUNTED, target, edgeMm },
})

describe('grouping', () => {
  it('needs two darts with a position and a target', () => {
    expect(grouping([placed(0, 0.6, 0)], 60)).toBeNull()
    expect(grouping([placed(0, 0.6, 0), { coords: null, class: { ...NOT_COUNTED, target: T20, edgeMm: 0 } }], 60)).toBeNull()
    expect(grouping([placed(0, 0.6, 0), placed(0, 0.6, 0, null)], 60)).toBeNull()
  })

  it('is the spread around the centroid, its offset from the shared target and the mean edge distance', () => {
    // T20's point is (0, 0.6055); two darts 6 mm either side of a centroid 3 mm above it
    const y = 0.6055 + mm(3)
    const g = grouping([placed(-mm(6), y, 0), placed(mm(6), y, 2)], 60)
    expect(g?.darts).toBe(2)
    expect(g?.spreadMm).toBeCloseTo(6, 9)
    expect(g?.offsetMm).toBeCloseTo(3, 9)
    expect(g?.edgeMm).toBe(1)
    expect(g?.rating).toBeCloseTo(60 + GROUPING_MAX * (1 - 6 / GROUPING_ZERO_MM) + CLOSENESS_MAX * (1 - 1 / CLOSENESS_ZERO_MM), 9)
  })

  it('has no spread or offset when the darts went at different targets; the closeness still counts', () => {
    const g = grouping([placed(0, 0.6, 0), placed(0.3, 0.5, 0, { aimId: 'T1', label: 'T1' })], 41)
    expect(g).toMatchObject({ spreadMm: null, offsetMm: null, edgeMm: 0, rating: 41 + CLOSENESS_MAX })
  })

  it('adds nothing past the zero points', () => {
    const g = grouping([placed(0, 0.2, 50), placed(0, 0.8, 50)], 40)
    expect(g?.spreadMm).toBeGreaterThan(GROUPING_ZERO_MM)
    expect(g?.rating).toBe(40)
  })

  it('says which parts earned a bonus', () => {
    expect(groupingWhy({ spreadMm: 6.2, edgeMm: 2.4 })).toBe('tight group (6 mm), close to the target (2 mm)')
    expect(groupingWhy({ spreadMm: null, edgeMm: 0.2 })).toBe('on target')
    expect(groupingWhy({ spreadMm: 4, edgeMm: 45 })).toBe('tight group (4 mm)')
    // A bonus too small to name: 18 mm from the treble isn't close
    expect(groupingWhy({ spreadMm: 20, edgeMm: 18 })).toBe('')
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
    return reviewLeg([leg([v])], 0, 0, { startScore: 501, average, opponentName: () => 'Opponent' })!.visits[0]
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
    expect(hugging).toMatchObject({ grade: 'good', text: 'Scored 60, tight group (6 mm), close to the target (7 mm).' })
    expect(outer).toMatchObject({ grade: 'ok', text: 'Scored 60.' })
  })

  it('a typed visit has no grouping: the rating is the score', () => {
    const v = review(visit(0, 501, ['S20', 'S20', 'S20']).darts)
    expect(v).toMatchObject({ grouping: null, grade: 'ok', text: 'Scored 60.' })
  })
})
