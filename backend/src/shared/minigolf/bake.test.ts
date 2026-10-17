import { describe, expect, it } from 'vitest'
import { bakeOutline, circlePolygon, flattenCurve, outlinesMatch } from './bake.js'
import { distanceToSegment, edgesOf, pointInPolygon } from './geometry.js'
import { testCourse } from './courses/test.js'
import type { Curve, Pt, Shape } from './types.js'

const lane: Pt[] = [
  [0, 0],
  [600, 0],
  [600, 2000],
  [0, 2000],
]
const straight = (corners: Pt[]) => corners.map((): Curve | null => null)
const shapeOf = (circles: Shape['circles'], corners = lane): Shape => ({ corners, curves: straight(corners), circles })

const area = (poly: readonly Pt[]) =>
  poly.reduce((s, [x, y], i) => s + x * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y, 0) / 2
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
const insideOrOn = (p: Pt, poly: readonly Pt[]) =>
  pointInPolygon(p, poly) || Math.min(...edgesOf(poly, true).map(([a, b]) => distanceToSegment(p, a, b))) < 1e-6

function baked(shape: Shape): Pt[] {
  const r = bakeOutline(shape)
  if (!r.ok) throw new Error(r.reason)
  return r.outline
}

function cubic(a: Pt, { c1, c2 }: Curve, b: Pt, t: number): Pt {
  const u = 1 - t
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return [w[0] * a[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * b[0], w[0] * a[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * b[1]]
}

/** The largest turn, in degrees, between one straight piece and the next. */
function maxTurn(pts: Pt[], closed: boolean): number {
  const n = pts.length
  let worst = 0
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const [a, b, c] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n]]
    const t1 = Math.atan2(b[1] - a[1], b[0] - a[0])
    const t2 = Math.atan2(c[1] - b[1], c[0] - b[0])
    const d = Math.abs(((t2 - t1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
    worst = Math.max(worst, (d * 180) / Math.PI)
  }
  return worst
}

describe('flattenCurve', () => {
  it('bends at most 2° from one piece to the next, even on a gentle wide curve', () => {
    const a: Pt = [0, 0]
    const b: Pt = [3000, 0]
    const pts = [a, ...flattenCurve(a, { c1: [1000, 400], c2: [2000, 400] }, b)]
    expect(maxTurn(pts, false)).toBeLessThanOrEqual(2.01)
  })

  const a: Pt = [0, 0]
  const b: Pt = [1000, 0]
  const bow: Curve = { c1: [333, -400], c2: [667, -400] }

  it('stays within 2 mm of the true curve and ends at b', () => {
    const pts = flattenCurve(a, bow, b)
    expect(pts.at(-1)).toEqual(b)
    const samples = Array.from({ length: 1001 }, (_, k) => cubic(a, bow, b, k / 1000))
    for (const p of pts) expect(Math.min(...samples.map(s => dist(p, s)))).toBeLessThanOrEqual(2)
    const poly = [a, ...pts]
    for (const s of samples) {
      expect(Math.min(...edgesOf(poly, false).map(([p, q]) => distanceToSegment(s, p, q)))).toBeLessThanOrEqual(2)
    }
  })

  it('gives few points for a straight curve and never more than 256', () => {
    expect(flattenCurve(a, { c1: [333, 0], c2: [667, 0] }, b).length).toBeLessThanOrEqual(2)
    expect(flattenCurve(a, { c1: [0, -1e6], c2: [1000, 1e6] }, b).length).toBeLessThanOrEqual(256)
  })
})

describe('circlePolygon', () => {
  it('turns 2° per corner, so a ball bounces off it almost as off a true circle', () => {
    expect(maxTurn(circlePolygon({ center: [0, 0], r: 450 }), true)).toBeLessThanOrEqual(2.01)
  })
  it('has 180 corners on the circle, the first at angle 0', () => {
    const pts = circlePolygon({ center: [100, 200], r: 50 })
    expect(pts).toHaveLength(180)
    expect(pts[0]).toEqual([150, 200])
    for (const p of pts) expect(dist(p, [100, 200])).toBeCloseTo(50, 9)
  })
})

describe('bakeOutline', () => {
  it('keeps a straight shape without circles as its corners', () => {
    expect(outlinesMatch(baked(shapeOf([])), lane)).toBe(true)
  })

  it('winds the same way as the existing outlines', () => {
    for (const h of testCourse.holes) expect(Math.sign(area(h.outline)), h.id).toBe(Math.sign(area(baked(shapeOf([])))))
    expect(Math.sign(area(baked(shapeOf([{ center: [300, 2000], r: 450 }]))))).toBe(Math.sign(area(lane)))
  })

  it('unions a circle at the end of the lane into a keyhole', () => {
    const circle = { center: [300, 2000] as Pt, r: 450 }
    const outline = baked(shapeOf([circle]))
    const ring = circlePolygon(circle)
    for (const p of [lane[2], lane[3]]) expect(insideOrOn(p, outline)).toBe(true)
    for (const p of ring.filter(p => !pointInPolygon(p, lane))) expect(insideOrOn(p, outline), String(p)).toBe(true)

    let overlap = 0
    for (let x = 5; x < 600; x += 10) for (let y = 1505; y < 2000; y += 10) if (pointInPolygon([x, y], ring)) overlap += 100
    const expected = Math.abs(area(lane)) + Math.abs(area(ring)) - overlap
    expect(Math.abs(Math.abs(area(outline)) - expected) / expected).toBeLessThan(0.01)
  })

  it('refuses a circle that does not overlap the course', () => {
    expect(bakeOutline(shapeOf([{ center: [3000, 3000], r: 200 }]))).toEqual({ ok: false, reason: 'The circle must overlap the course' })
  })

  it('refuses a ring of circles round an empty middle', () => {
    const corners: Pt[] = [
      [600, -100],
      [1200, -100],
      [1200, 100],
      [600, 100],
    ]
    const circles = (
      [
        [600, 0],
        [0, 600],
        [-600, 0],
        [0, -600],
      ] as Pt[]
    ).map(center => ({ center, r: 450 }))
    expect(bakeOutline(shapeOf(circles, corners))).toEqual({ ok: false, reason: "The shape can't have a hole in the middle" })
  })

  it('never gives two rings for a circle that only just touches the lane', () => {
    const r = bakeOutline(shapeOf([{ center: [300, 2450], r: 450 }]))
    if (r.ok) expect(r.outline.length).toBeGreaterThanOrEqual(3)
    else expect(r.reason).toBe('The circle must overlap the course')
  })

  it('makes one ring without slivers from two circles overlapping at the cup', () => {
    const outline = baked(
      shapeOf([
        { center: [300, 300], r: 400 },
        { center: [450, 350], r: 350 },
      ]),
    )
    for (let i = 0; i < outline.length; i++) {
      for (let j = i + 1; j < outline.length; j++) expect(dist(outline[i], outline[j])).toBeGreaterThanOrEqual(1)
    }
  })

  it('flattens curved edges into the outline', () => {
    const curves = straight(lane)
    curves[1] = { c1: [800, 600], c2: [800, 1400] }
    const outline = baked({ corners: lane, curves, circles: [] })
    expect(outline.length).toBeGreaterThan(4)
    expect(Math.max(...outline.map(p => p[0]))).toBeGreaterThan(700)
  })

  it('bakes a shape of circles only, and refuses one with no area', () => {
    expect(baked({ corners: [], curves: [], circles: [{ center: [0, 0], r: 100 }] })).toHaveLength(180)
    expect(bakeOutline({ corners: [], curves: [], circles: [] })).toEqual({ ok: false, reason: 'The shape needs an area' })
  })

  it('refuses corners that cross each other, straight or curved', () => {
    const bowtie: Pt[] = [
      [0, 0],
      [600, 600],
      [600, 0],
      [0, 600],
    ]
    expect(bakeOutline(shapeOf([], bowtie))).toEqual({ ok: false, reason: "The edges can't cross each other" })
    const curves = straight(lane)
    curves[1] = { c1: [1600, 4000], c2: [1600, -2000] } // bent back over itself into a loop
    expect(bakeOutline({ corners: lane, curves, circles: [] })).toEqual({ ok: false, reason: "The edges can't cross each other" })
  })

  it('refuses corners that touch each other, as two pieces of course', () => {
    const bowtie: Pt[] = [
      [0, 0],
      [200, 0],
      [100, 100],
      [200, 200],
      [0, 200],
      [100, 100],
    ]
    expect(bakeOutline(shapeOf([], bowtie))).toEqual({ ok: false, reason: "The outline can't touch itself" })
  })

  it('refuses fewer than 3 corners', () => {
    expect(bakeOutline(shapeOf([{ center: [0, 0], r: 100 }], lane.slice(0, 2)))).toEqual({
      ok: false,
      reason: 'The outline needs at least 3 corners',
    })
  })

  it('gives the same outline every time', () => {
    const shape = shapeOf([
      { center: [300, 2000], r: 450 },
      { center: [450, 350], r: 350 },
    ])
    expect(bakeOutline(shape)).toEqual(bakeOutline(shape))
  })
})

describe('outlinesMatch', () => {
  it('allows a rotated start and a small error, not a different corner count', () => {
    expect(outlinesMatch(lane, [lane[2], [lane[3][0] + 0.5, lane[3][1]], lane[0], lane[1]])).toBe(true)
    expect(outlinesMatch(lane, [lane[2], [lane[3][0] + 2, lane[3][1]], lane[0], lane[1]])).toBe(false)
    expect(outlinesMatch(lane, lane.slice(1))).toBe(false)
  })
})
