import { describe, expect, it } from 'vitest'
import {
  addCircle,
  addShapeCorner,
  curveEdge,
  ensureShape,
  loadShape,
  moveCircle,
  moveControl,
  moveShapeCorner,
  removeCircle,
  removeShapeCorner,
  resizeCircle,
  straightenEdge,
  withShape,
  type ShapeResult,
} from '$lib/minigolf/editor/shapeOps'
import { addCorner, elementsOf, hitTest, moveCorner, moveElement, removeCorner, removeElement } from '$lib/minigolf/editor/ops'
import { createHistory } from '$lib/minigolf/editor/history'
import { bakeOutline, outlinesMatch } from '$shared/minigolf/bake'
import { testCourse } from '$shared/minigolf/courses/test'
import type { Hole, Pt } from '$shared/minigolf/types'

const lane = testCourse.holes[0] as Hole // test-straight: [0,0]-[500,0]-[500,3000]-[0,3000]

function ok(r: { ok: true; hole: Hole } | { ok: false; reason: string }): Hole {
  if (!r.ok) throw new Error(r.reason)
  return r.hole
}

const near = (p: Pt, q: Pt, tol = 1e-9) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol

/** The lane with a circle round its far end: a keyhole. */
const keyhole = () => ok(addCircle(lane, [250, 3000], 450))

describe('ensureShape', () => {
  it('turns a plain hole into corners with straight edges and no circles', () => {
    expect(ensureShape(lane)).toEqual({ corners: lane.outline, curves: [null, null, null, null], circles: [] })
  })

  it('returns the hole’s own shape when it has one', () => {
    const h = keyhole()
    expect(ensureShape(h)).toBe(h.shape)
  })
})

describe('withShape', () => {
  it('bakes the shape into the outline', () => {
    const shape = { ...ensureShape(lane), circles: [{ center: [250, 3000] as Pt, r: 450 }] }
    const h = ok(withShape(lane, shape))
    expect(h.shape).toBe(shape)
    expect(h.outline.length).toBeGreaterThan(4)
  })

  it('refuses a shape that does not bake, without touching the hole', () => {
    const shape = { ...ensureShape(lane), circles: [{ center: [5000, 5000] as Pt, r: 100 }] }
    expect(withShape(lane, shape)).toEqual({ ok: false, reason: 'The circle must overlap the course' })
  })
})

describe('circles', () => {
  it('adds a circle to a hole without a shape, its edges all straight', () => {
    const h = keyhole()
    expect(h.shape?.corners).toEqual(lane.outline)
    expect(h.shape?.curves).toEqual([null, null, null, null])
    expect(h.shape?.circles).toEqual([{ center: [250, 3000], r: 450 }])
    expect(h.outline.some(([, y]) => y > 3400)).toBe(true)
    expect(lane.shape).toBeUndefined() // never mutates
  })

  it('refuses a circle that does not touch the course', () => {
    expect(addCircle(lane, [5000, 5000], 100)).toEqual({ ok: false, reason: 'The circle must overlap the course' })
  })

  it('refuses a circle without a radius', () => {
    expect(addCircle(lane, [250, 3000], 0)).toEqual({ ok: false, reason: 'The circle needs a radius' })
  })

  it('moves a circle and rebakes', () => {
    const h = ok(moveCircle(keyhole(), 0, [250, 0]))
    expect(h.shape?.circles[0].center).toEqual([250, 0])
    expect(h.outline.some(([, y]) => y < -400)).toBe(true)
    expect(h.outline.some(([, y]) => y > 3400)).toBe(false)
  })

  it('refuses to move a circle off the course', () => {
    expect(moveCircle(keyhole(), 0, [5000, 5000])).toEqual({ ok: false, reason: 'The circle must overlap the course' })
  })

  it('resizes a circle and rebakes', () => {
    const h = ok(resizeCircle(keyhole(), 0, 600))
    expect(h.shape?.circles[0].r).toBe(600)
    expect(Math.max(...h.outline.map(([, y]) => y))).toBeCloseTo(3600, 0)
  })

  it('removes a circle, leaving the lane', () => {
    const h = ok(removeCircle(keyhole(), 0))
    expect(h.shape?.circles).toEqual([])
    expect(outlinesMatch(h.outline, lane.outline)).toBe(true)
  })
})

describe('curved edges', () => {
  it('bows an edge outward from a third along, by a sixth of its length', () => {
    // edge 1 runs [500,0] → [500,3000]; outward is +x
    const h = ok(curveEdge(lane, 1))
    expect(h.shape?.curves[1]).toEqual({ c1: [1000, 1000], c2: [1000, 2000] })
    expect(Math.max(...h.outline.map(([x]) => x))).toBeGreaterThan(800)
  })

  it('bows the opposite edge the other way', () => {
    const h = ok(curveEdge(lane, 3)) // [0,3000] → [0,0]; outward is -x
    expect(h.shape?.curves[3]).toEqual({ c1: [-500, 2000], c2: [-500, 1000] })
  })

  it('straightens it back to the lane', () => {
    const h = ok(straightenEdge(ok(curveEdge(lane, 1)), 1))
    expect(h.shape?.curves).toEqual([null, null, null, null])
    expect(outlinesMatch(h.outline, lane.outline)).toBe(true)
  })

  it('moves a control point', () => {
    const h = ok(moveControl(ok(curveEdge(lane, 1)), 1, 'c2', [800, 2500]))
    expect(h.shape?.curves[1]).toEqual({ c1: [1000, 1000], c2: [800, 2500] })
  })

  it('refuses to move a control on a straight edge', () => {
    expect(moveControl(lane, 1, 'c1', [800, 1000])).toEqual({ ok: false, reason: 'The edge is straight' })
  })

  const ell: Hole = {
    ...lane,
    outline: [
      [0, 0],
      [2000, 0],
      [2000, 500],
      [500, 500],
      [500, 3000],
      [0, 3000],
    ],
  }

  it('bows an edge of a concave hole out of the hole, into its notch', () => {
    const c = ok(curveEdge(ell, 3)).shape!.curves[3]! // [500,500] → [500,3000]
    expect(c.c1[0]).toBeGreaterThan(500)
    expect(c.c2[0]).toBeGreaterThan(500)
  })

  it('bows an outer edge of a concave hole outward', () => {
    const c = ok(curveEdge(ell, 5)).shape!.curves[5]! // [0,3000] → [0,0]
    expect(c.c1[0]).toBeLessThan(0)
    expect(c.c2[0]).toBeLessThan(0)
  })

  it('bows outward whichever way the corners wind', () => {
    const reversed: Hole = { ...lane, outline: [...lane.outline].reverse() } // edge 0: [0,3000] → [500,3000]
    expect(ok(curveEdge(reversed, 0)).shape!.curves[0]!.c1[1]).toBeGreaterThan(3000)
  })
})

describe('shape corners', () => {
  it('moves a corner with both neighbouring control points', () => {
    const curved = ok(curveEdge(ok(curveEdge(lane, 1)), 2)) // edges 1 and 2 meet at corner 2, [500,3000]
    const before = curved.shape!
    const h = ok(moveShapeCorner(curved, 2, [600, 3100]))
    expect(h.shape?.corners[2]).toEqual([600, 3100])
    expect(h.shape?.curves[1]?.c1).toEqual(before.curves[1]?.c1)
    expect(h.shape?.curves[1]?.c2).toEqual([before.curves[1]!.c2[0] + 100, before.curves[1]!.c2[1] + 100])
    expect(h.shape?.curves[2]?.c1).toEqual([before.curves[2]!.c1[0] + 100, before.curves[2]!.c1[1] + 100])
    expect(h.shape?.curves[2]?.c2).toEqual(before.curves[2]?.c2)
  })

  it('moves corner 0 with the control of the last edge', () => {
    const curved = ok(curveEdge(lane, 3))
    const h = ok(moveShapeCorner(curved, 0, [-50, -50]))
    expect(h.shape?.curves[3]?.c2).toEqual([curved.shape!.curves[3]!.c2[0] - 50, curved.shape!.curves[3]!.c2[1] - 50])
  })

  it('splits a straight edge at its middle', () => {
    const h = ok(addShapeCorner(keyhole(), 0))
    expect(h.shape?.corners[1]).toEqual([250, 0])
    expect(h.shape?.curves).toEqual([null, null, null, null, null])
  })

  it('splits a curved edge without changing the shape', () => {
    const curved = ok(curveEdge(lane, 1))
    const h = ok(addShapeCorner(curved, 1))
    expect(h.shape?.corners).toHaveLength(5)
    expect(h.shape?.curves).toHaveLength(5)
    const [p, q] = [h.shape!.corners[2], [875, 1500] as Pt] // the Bézier at t = 0.5
    expect(near(p, q)).toBe(true)
    // the baked outline stays within 2 mm of the unsplit one
    const far = Math.max(...h.outline.map(p => Math.min(...curved.outline.map(q => Math.hypot(p[0] - q[0], p[1] - q[1])))))
    expect(far).toBeLessThanOrEqual(2)
  })

  it('splits the closing edge after the last corner', () => {
    const h = ok(addShapeCorner(keyhole(), 3))
    expect(h.shape?.corners.at(-1)).toEqual([0, 1500])
  })

  it('removes a corner, merging its two edges into one straight edge', () => {
    const five = ok(addShapeCorner(ok(curveEdge(lane, 1)), 0)) // corners 0,[250,0],1,2,3; curve on edge 2
    const h = ok(removeShapeCorner(five, 2)) // corner [500,0] between edges 1 and 2
    expect(h.shape?.corners).toHaveLength(4)
    expect(h.shape?.curves).toHaveLength(4)
    expect(h.shape?.curves[1]).toBeNull()
  })

  it('removes corner 0 next to a curved closing edge, keeping curves in step', () => {
    const curved = ok(curveEdge(ok(curveEdge(ok(addShapeCorner(lane, 0)), 4)), 1))
    const h = ok(removeShapeCorner(curved, 0))
    expect(h.shape?.corners).toHaveLength(4)
    expect(h.shape?.curves).toHaveLength(4)
    expect(h.shape?.curves.at(-1)).toBeNull() // edges 4 and 0 merged, straight
    expect(h.shape?.curves[0]).toEqual(curved.shape?.curves[1])
  })

  it('refuses to go below 3 corners', () => {
    const tri: Hole = {
      ...lane,
      outline: [
        [0, 0],
        [500, 0],
        [0, 500],
      ],
    }
    expect(removeShapeCorner(tri, 1)).toEqual({ ok: false, reason: 'The outline needs at least 3 corners' })
  })
})

describe('loadShape', () => {
  it('keeps a shape that matches its outline', () => {
    const h = keyhole()
    expect(loadShape(h)).toEqual({ hole: h, dropped: false })
  })

  it('keeps a matching shape whose outline starts at another corner', () => {
    const h = keyhole()
    const rotated = { ...h, outline: [...h.outline.slice(3), ...h.outline.slice(0, 3)] }
    expect(loadShape(rotated).dropped).toBe(false)
  })

  it('drops a shape whose outline was changed elsewhere, outline untouched', () => {
    const h = { ...keyhole(), outline: lane.outline }
    const { hole, dropped } = loadShape(h)
    expect(dropped).toBe(true)
    expect(hole.shape).toBeUndefined()
    expect(hole.outline).toBe(lane.outline)
  })

  it('drops a shape that no longer bakes', () => {
    const h = keyhole()
    const broken = { ...h, shape: { ...h.shape!, circles: [{ center: [5000, 5000] as Pt, r: 10 }] } }
    expect(loadShape(broken).dropped).toBe(true)
  })

  it('passes a hole without a shape through', () => {
    expect(loadShape(lane)).toEqual({ hole: lane, dropped: false })
  })
})

describe('history', () => {
  it('only holds valid holes: undo after a refusal returns the last valid one', () => {
    const history = createHistory(lane)
    let current = lane
    const apply = (r: ShapeResult) => {
      if (r.ok) history.push((current = r.hole))
    }
    apply(addCircle(current, [250, 3000], 450))
    const valid = current
    apply(moveCircle(current, 0, [5000, 5000])) // refused
    expect(current).toBe(valid)
    apply(moveCircle(current, 0, [250, 0]))
    expect(history.undo()).toBe(valid)
    expect(history.undo()).toBe(lane)
  })
})

describe('ops.ts with a shape', () => {
  it('moves a shape corner through moveCorner, rebaking', () => {
    const h = moveCorner(keyhole(), 1, [600, 0])
    expect(h.shape?.corners[1]).toEqual([600, 0])
    expect(outlinesMatch(h.outline, (bakeOutline(h.shape!) as { outline: Pt[] }).outline)).toBe(true)
  })

  it('returns the hole unchanged on a refusal', () => {
    const h = keyhole()
    expect(moveCorner(h, 1, [-500, 1500])).toBe(h) // edges would cross
  })

  it('adds and removes shape corners', () => {
    const h = addCorner(keyhole(), 0)
    expect(h.shape?.corners).toHaveLength(5)
    expect(removeCorner(h, 1).shape?.corners).toHaveLength(4)
  })

  it('moves and removes a circle by ref', () => {
    const h = keyhole()
    expect(moveElement(h, { kind: 'circle', index: 0 }, [0, -100]).shape?.circles[0].center).toEqual([250, 2900])
    expect(removeElement(h, { kind: 'circle', index: 0 }).shape?.circles).toEqual([])
  })

  it('moves a shape corner by ref from the shape’s corners', () => {
    const h = moveElement(keyhole(), { kind: 'outline', index: 1 }, [100, 0])
    expect(h.shape?.corners[1]).toEqual([600, 0])
  })

  it('lists circles in the elements', () => {
    expect(elementsOf(keyhole())).toContainEqual({ ref: { kind: 'circle', index: 0 }, label: 'Circle 1', detail: 'r 450 mm' })
  })

  it('picks a circle by its rim or centre', () => {
    const h = keyhole()
    expect(hitTest(h, [250 + 450, 3000])).toEqual({ kind: 'circle', index: 0 })
    expect(hitTest(h, [250, 3000])).toEqual({ kind: 'circle', index: 0 })
    expect(hitTest(h, [250, 3200])).toBeNull()
  })
})
