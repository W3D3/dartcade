// Pure editing operations on a hole's shape (corners, curved edges, circles). Each rebakes the
// outline and refuses, with the reason, a shape that doesn't bake; nothing here mutates the hole.
// Design: docs/superpowers/specs/2026-10-15-minigolf-outline-shapes-design.md
import { bakeOutline, outlinesMatch } from '$shared/minigolf/bake'
import type { Curve, Hole, Pt, Shape } from '$shared/minigolf/types'
import { createHistory, type History } from './history'

export type ShapeResult = { ok: true; hole: Hole } | { ok: false; reason: string }

const add = (p: Pt, d: Pt): Pt => [p[0] + d[0], p[1] + d[1]]
const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]

/** The hole's shape, or its outline as straight-edged corners for a hole drawn without one. */
export function ensureShape(h: Hole): Shape {
  return h.shape ?? { corners: h.outline, curves: h.outline.map(() => null), circles: [] }
}

export function withShape(h: Hole, shape: Shape): ShapeResult {
  if (shape.circles.some(c => !(c.r > 0))) return { ok: false, reason: 'The circle needs a radius' }
  const baked = bakeOutline(shape)
  return baked.ok ? { ok: true, hole: { ...h, shape, outline: baked.outline } } : baked
}

/** The hole with its shape changed by `f` (given the shape, plain holes included). */
const edit = (h: Hole, f: (s: Shape) => Shape): ShapeResult => withShape(h, f(ensureShape(h)))

// --- Circles ---

export function addCircle(h: Hole, center: Pt, r: number): ShapeResult {
  return edit(h, s => ({ ...s, circles: [...s.circles, { center, r }] }))
}

export function moveCircle(h: Hole, i: number, center: Pt): ShapeResult {
  return edit(h, s => ({ ...s, circles: s.circles.map((c, k) => (k === i ? { ...c, center } : c)) }))
}

export function resizeCircle(h: Hole, i: number, r: number): ShapeResult {
  return edit(h, s => ({ ...s, circles: s.circles.map((c, k) => (k === i ? { ...c, r } : c)) }))
}

export function removeCircle(h: Hole, i: number): ShapeResult {
  return edit(h, s => ({ ...s, circles: s.circles.filter((_, k) => k !== i) }))
}

// --- Curved edges ---

const setCurve = (s: Shape, i: number, curve: Curve | null): Shape => ({ ...s, curves: s.curves.map((c, k) => (k === i ? curve : c)) })

/** Bows edge i gently outward: controls a third of the way in from each end, pushed out of the
 *  polygon by a sixth of the edge's length. */
export function curveEdge(h: Hole, i: number): ShapeResult {
  return edit(h, s => {
    const a = s.corners[i]
    const b = s.corners[(i + 1) % s.corners.length]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    // Shoelace signed area: with it positive, (dy, -dx) points out of the polygon (concave ones too)
    const area = s.corners.reduce((t, p, k) => {
      const q = s.corners[(k + 1) % s.corners.length]
      return t + p[0] * q[1] - q[0] * p[1]
    }, 0)
    const sign = area < 0 ? -1 : 1
    const out: Pt = [(sign * dy) / 6, (sign * -dx) / 6]
    return setCurve(s, i, { c1: add([a[0] + dx / 3, a[1] + dy / 3], out), c2: add([a[0] + (2 * dx) / 3, a[1] + (2 * dy) / 3], out) })
  })
}

export function straightenEdge(h: Hole, i: number): ShapeResult {
  return edit(h, s => setCurve(s, i, null))
}

export function moveControl(h: Hole, i: number, which: 'c1' | 'c2', p: Pt): ShapeResult {
  const curve = ensureShape(h).curves[i]
  if (!curve) return { ok: false, reason: 'The edge is straight' }
  return edit(h, s => setCurve(s, i, { ...curve, [which]: p }))
}

// --- Corners ---

/** Moves corner i, carrying the control points next to it (edge i-1's c2, edge i's c1) by the
 *  same amount so the curves keep their shape. */
export function moveShapeCorner(h: Hole, i: number, p: Pt): ShapeResult {
  return edit(h, s => {
    const d: Pt = [p[0] - s.corners[i][0], p[1] - s.corners[i][1]]
    const prev = (i - 1 + s.corners.length) % s.corners.length
    const curves = s.curves
      .map((c, k) => (c && k === prev ? { ...c, c2: add(c.c2, d) } : c))
      .map((c, k) => (c && k === i ? { ...c, c1: add(c.c1, d) } : c))
    return { ...s, corners: s.corners.map((c, k) => (k === i ? p : c)), curves }
  })
}

/** Splits the edge after `afterIndex` at its middle; a curved edge is split in two curves
 *  (de Casteljau at t = 0.5) that trace the same path. */
export function addShapeCorner(h: Hole, afterIndex: number): ShapeResult {
  return edit(h, s => {
    const a = s.corners[afterIndex]
    const b = s.corners[(afterIndex + 1) % s.corners.length]
    const c = s.curves[afterIndex]
    let corner = mid(a, b)
    let halves: (Curve | null)[] = [null, null]
    if (c) {
      const [m01, m12, m23] = [mid(a, c.c1), mid(c.c1, c.c2), mid(c.c2, b)]
      const [l2, r1] = [mid(m01, m12), mid(m12, m23)]
      corner = mid(l2, r1)
      halves = [
        { c1: m01, c2: l2 },
        { c1: r1, c2: m23 },
      ]
    }
    const at = afterIndex + 1
    return {
      ...s,
      corners: [...s.corners.slice(0, at), corner, ...s.corners.slice(at)],
      curves: [...s.curves.slice(0, afterIndex), ...halves, ...s.curves.slice(at)],
    }
  })
}

/** Removes corner i, merging its two edges into one straight edge. Refuses below 3 corners. */
export function removeShapeCorner(h: Hole, i: number): ShapeResult {
  const s = ensureShape(h)
  if (s.corners.length <= 3) return { ok: false, reason: 'The outline needs at least 3 corners' }
  const prev = (i - 1 + s.corners.length) % s.corners.length
  return withShape(h, {
    ...s,
    corners: s.corners.filter((_, k) => k !== i),
    curves: s.curves.map((c, k) => (k === prev ? null : c)).filter((_, k) => k !== i),
  })
}

// --- Loading ---

/** A hole as the editor opens it: its shape is dropped (`dropped: true`, outline kept) when the
 *  outline was changed without it, i.e. the shape no longer bakes into the same corners. */
export function loadShape(h: Hole): { hole: Hole; dropped: boolean } {
  if (!h.shape) return { hole: h, dropped: false }
  const baked = bakeOutline(h.shape)
  if (baked.ok && outlinesMatch(baked.outline, h.outline)) return { hole: h, dropped: false }
  const { shape: _, ...plain } = h
  return { hole: plain, dropped: true }
}

/** The hole the editor opens and its undo history. A dropped shape is an edit like any other: one
 *  undo brings the hole as loaded back, circles and curves included. */
export function openHole(h: Hole): { hole: Hole; history: History; dropped: boolean } {
  const { hole, dropped } = loadShape(h)
  const history = createHistory(h)
  if (dropped) history.push(hole)
  return { hole, history, dropped }
}
