// Bakes a hole's shape (corners, curved edges, circles) into the outline that's played.
// Design: docs/superpowers/specs/2026-10-15-minigolf-outline-shapes-design.md
// Changing its numbers (sides, tolerance, merge) or polyclip-ts changes baked outlines: the editor then drops stored shapes.
import { union } from 'polyclip-ts'
import { distanceToSegment } from './geometry.js'
import { crossesItself } from './hole.js'
import type { Circle, Curve, Pt, Shape } from './types.js'

const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
/** The most a baked outline turns from one straight piece to the next, radians: a ball bounces off
 *  it at most half this off a true curve, too little to see. */
const MAX_TURN = (2 * Math.PI) / 180

/** How far a piece's direction turns from its start to its end, radians. */
function turn(p0: Pt, p1: Pt, p2: Pt, p3: Pt): number {
  // A control point on its end leaves no direction there: use the next one along
  const from = p1[0] === p0[0] && p1[1] === p0[1] ? p2 : p1
  const to = p2[0] === p3[0] && p2[1] === p3[1] ? p1 : p2
  const a = Math.atan2(from[1] - p0[1], from[0] - p0[0])
  const b = Math.atan2(p3[1] - to[1], p3[0] - to[0])
  return Math.abs(((b - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
}

/** The curve from a to b as straight pieces, each within `tolerance` mm of it and turning at most
 *  MAX_TURN: the points after a, up to and including b. */
export function flattenCurve(a: Pt, c: Curve, b: Pt, tolerance = 2, maxPieces = 256): Pt[] {
  const maxDepth = Math.floor(Math.log2(maxPieces))
  const out: Pt[] = []
  const split = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, depth: number): void => {
    // The curve stays within its control points' hull, so near controls mean a near chord
    const near = Math.max(distanceToSegment(p1, p0, p3), distanceToSegment(p2, p0, p3)) <= tolerance
    if (depth >= maxDepth || (near && turn(p0, p1, p2, p3) <= MAX_TURN)) {
      out.push(p3)
      return
    }
    const [m01, m12, m23] = [mid(p0, p1), mid(p1, p2), mid(p2, p3)]
    const [l2, r1] = [mid(m01, m12), mid(m12, m23)]
    const m = mid(l2, r1)
    split(p0, m01, l2, m, depth + 1)
    split(m, r1, m23, p3, depth + 1)
  }
  split(a, c.c1, c.c2, b, 0)
  return out
}

/** The circle as a polygon of `sides` corners, the first at angle 0: by default one per MAX_TURN. */
export function circlePolygon({ center: [x, y], r }: Circle, sides = Math.round((2 * Math.PI) / MAX_TURN)): Pt[] {
  return Array.from({ length: sides }, (_, k) => {
    const a = (2 * Math.PI * k) / sides
    return [x + r * Math.cos(a), y + r * Math.sin(a)]
  })
}

/** Drops corners within 1 mm of the one before, wrapping round, so the outline has no slivers. */
function mergeClose(ring: Pt[]): Pt[] {
  const near = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1
  const out: Pt[] = []
  for (const p of ring) if (!out.length || !near(p, out[out.length - 1])) out.push(p)
  while (out.length > 1 && near(out[0], out[out.length - 1])) out.pop()
  return out
}

export function bakeOutline(shape: Shape): { ok: true; outline: Pt[] } | { ok: false; reason: string } {
  const { corners, curves, circles } = shape
  if (corners.length > 0 && corners.length < 3) return { ok: false, reason: 'The outline needs at least 3 corners' }
  const ring = corners.flatMap((a, i) => {
    const c = curves[i]
    return c ? [a, ...flattenCurve(a, c, corners[(i + 1) % corners.length]).slice(0, -1)] : [a]
  })
  // polyclip would untangle a crossing into pieces, which would read as a circle off the course
  if (crossesItself(ring)) return { ok: false, reason: "The edges can't cross each other" }
  const mutable = (pts: Pt[]) => pts.map(([x, y]): [number, number] => [x, y])
  // polyclip throws on an empty ring (a shape of circles only has no corners)
  const rings = [ring, ...circles.map(c => circlePolygon(c))].filter(r => r.length >= 3).map(r => [mutable(r)])
  const polys = rings.length ? union(rings[0], ...rings.slice(1)) : []
  if (polys.length === 0) return { ok: false, reason: 'The shape needs an area' }
  if (polys.length > 1) return { ok: false, reason: 'The circle must overlap the course' }
  if (polys[0].length > 1) return { ok: false, reason: "The shape can't have a hole in the middle" }
  // polyclip winds outer rings with a positive signed area, as the existing outlines are (bake.test.ts checks)
  return { ok: true, outline: mergeClose(polys[0][0].slice(0, -1)) }
}

/** Whether a and b have the same corners, each within `tol` mm, allowing a different start. */
export function outlinesMatch(a: readonly Pt[], b: readonly Pt[], tol = 1): boolean {
  if (a.length !== b.length) return false
  const near = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol
  return a.some((_, r) => a.every((p, i) => near(p, b[(i + r) % b.length])))
}
