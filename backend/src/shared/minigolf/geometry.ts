// Plane geometry for holes, with arithmetic only (no trig), so results match everywhere.
import { BALL_R, type Hole, type Pt } from './types.js'

/** Even-odd ray cast; points exactly on an edge may land either side. */
export function pointInPolygon([x, y]: Pt, poly: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Proper crossing of segments ab and cd (touching endpoints and collinear overlaps don't count). */
export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

export function bounds(pts: readonly Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [x, y] of pts) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

/** Whether a ball can roll straight from `from` to `to`: no rail, wall or bumper in the way. */
export function lineClear(hole: Hole, from: Pt, to: Pt): boolean {
  const edges = (pts: readonly Pt[], closed: boolean) =>
    pts.slice(0, closed ? pts.length : pts.length - 1).map((p, i): [Pt, Pt] => [p, pts[(i + 1) % pts.length]])
  const walls = [...edges(hole.outline, true), ...hole.walls.flatMap(w => edges(w.points, !!w.closed))]
  if (walls.some(([a, b]) => segmentsIntersect(from, to, a, b))) return false
  return hole.bumpers.every(b => distanceToSegment(b.at, from, to) > b.r + BALL_R)
}

/** The distance from p to the segment ab. */
export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  const x = a[0] + t * dx - p[0]
  const y = a[1] + t * dy - p[1]
  return Math.sqrt(x * x + y * y)
}
