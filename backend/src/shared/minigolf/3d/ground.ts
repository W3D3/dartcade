// The ground in 3D (a bench experiment): heights from the slopes and a mesh of it, in mm. A slope's
// push in 2D is `strength` mm/s², so it rises strength / g per mm: gravity on it then pushes the
// ball just as hard, and a hole plays the same in 3D as in 2D.
import { closestOnSegment, pointInPolygon } from '../geometry.js'
import type { Hole, Pt } from '../types.js'

/** Gravity, mm/s². */
export const G = 9810

/** How far past [lo, hi] v is, in units of the side's width (0 inside). */
const past = (v: number, lo: number, hi: number, below: number, above: number) =>
  v < lo ? (lo - v) / below : v > hi ? (v - hi) / above : 0

/** The ground's height at p, mm: a hill's cone or a bump's ridge (negative: a bowl, a trench),
 *  plus any terrain. */
export function heightAt(hole: Hole, p: Pt): number {
  let h = 0
  for (const { mesa } of hole.terrain ?? []) {
    const [left, top, right, bottom] = mesa.edges
    const x = past(p[0], Math.min(mesa.from[0], mesa.to[0]), Math.max(mesa.from[0], mesa.to[0]), left, right)
    const y = past(p[1], Math.min(mesa.from[1], mesa.to[1]), Math.max(mesa.from[1], mesa.to[1]), top, bottom)
    h += mesa.height * Math.max(0, 1 - Math.hypot(x, y))
  }
  for (const s of hole.slopes) {
    const { strength, reach, from } =
      'radial' in s
        ? { ...s.radial, reach: s.radial.radius, from: s.radial.center }
        : { ...s.bump, reach: s.bump.width, from: closestOnSegment(p, s.bump.from, s.bump.to) }
    h += (strength / G) * Math.max(0, reach - Math.hypot(p[0] - from[0], p[1] - from[1]))
  }
  return h
}

/** The ground's heights on a grid `step` mm apart over the outline's bounds, row by row. */
export function heightGrid(hole: Hole, step: number): { x0: number; y0: number; nx: number; ny: number; heights: Float32Array } {
  const xs = hole.outline.map(p => p[0])
  const ys = hole.outline.map(p => p[1])
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
  const nx = Math.ceil((Math.max(...xs) - x0) / step)
  const ny = Math.ceil((Math.max(...ys) - y0) / step)
  const heights = new Float32Array((nx + 1) * (ny + 1))
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) heights[j * (nx + 1) + i] = heightAt(hole, [x0 + i * step, y0 + j * step])
  return { x0, y0, nx, ny, heights }
}

/** The course's ground as triangles on a grid `step` mm apart, the cup left open. Positions are
 *  three.js-style x, y (up: the height), z (the course's y). */
export function groundMesh(hole: Hole, step: number): { positions: Float32Array; indices: Uint32Array } {
  const xs = hole.outline.map(p => p[0])
  const ys = hole.outline.map(p => p[1])
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
  const nx = Math.ceil((Math.max(...xs) - x0) / step)
  const ny = Math.ceil((Math.max(...ys) - y0) / step)
  const positions = new Float32Array((nx + 1) * (ny + 1) * 3)
  const [cx, cy] = hole.cup.at
  const at = (i: number, j: number): Pt => [x0 + i * step, y0 + j * step]
  const inCup = (p: Pt) => Math.hypot(p[0] - cx, p[1] - cy) < hole.cup.r
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      let p = at(i, j)
      // Points inside the cup move out onto its rim, so the hole comes out round
      if (inCup(p)) {
        const d = Math.hypot(p[0] - cx, p[1] - cy)
        p = d > 0 ? [cx + ((p[0] - cx) * hole.cup.r) / d, cy + ((p[1] - cy) * hole.cup.r) / d] : [cx + hole.cup.r, cy]
      }
      positions.set([p[0], heightAt(hole, p), p[1]], (j * (nx + 1) + i) * 3)
    }
  const indices: number[] = []
  const v = (i: number, j: number) => j * (nx + 1) + i
  // A triangle stays if it's on the course and not wholly in the cup
  const keep = (a: Pt, b: Pt, c: Pt) =>
    pointInPolygon([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3], hole.outline) && !(inCup(a) && inCup(b) && inCup(c))
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      // Wound counter-clockwise seen from above (y up), so the faces point up
      if (keep(at(i, j), at(i, j + 1), at(i + 1, j))) indices.push(v(i, j), v(i, j + 1), v(i + 1, j))
      if (keep(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1))) indices.push(v(i + 1, j), v(i, j + 1), v(i + 1, j + 1))
    }
  return { positions, indices: Uint32Array.from(indices) }
}
