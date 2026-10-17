// The ground in 3D: heights from the slopes and a mesh of it, in mm. A slope's `strength` is its
// push in mm/s², so it rises strength / g per mm: gravity on it then pushes the ball just as hard.
import { closestOnSegment, pointInPolygon } from '../geometry.js'
import type { Hole, Pt } from '../types.js'

/** Gravity, mm/s². */
export const G = 9810
/** How deep the cup is, mm, from the ground at its centre. */
export const CUP_DEPTH = 120

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

/** The slopes' pull on a ball at p, mm/s²: away from a hill's centre or a bump's ridge. */
export function slopeForce(hole: Hole, p: Pt): Pt {
  let fx = 0
  let fy = 0
  for (const s of hole.slopes) {
    const { strength, reach, from } =
      'radial' in s
        ? { ...s.radial, reach: s.radial.radius, from: s.radial.center }
        : { ...s.bump, reach: s.bump.width, from: closestOnSegment(p, s.bump.from, s.bump.to) }
    const dx = p[0] - from[0]
    const dy = p[1] - from[1]
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0 && len < reach) {
      fx += (dx / len) * strength
      fy += (dy / len) * strength
    }
  }
  return [fx, fy]
}

type Mesh = { positions: Float32Array; indices: Uint32Array }

/** The rim's corners: the cup is a 48-sided hole. */
const RIM = 48
/** The smallest triangles' size, mm: on slopes, terrain edges, the outline and round the cup. */
const FINE = 20
/** How far the ground may stray from heightAt before its triangles get smaller, mm. */
const TOL = 0.5

const rim = (hole: Hole): Pt[] =>
  Array.from({ length: RIM }, (_, k) => {
    const a = (k / RIM) * 2 * Math.PI
    return [hole.cup.at[0] + Math.cos(a) * hole.cup.r, hole.cup.at[1] + Math.sin(a) * hole.cup.r]
  })

/** Adds triangle abc to `indices`, wound so its face points along `n` (counter-clockwise seen from there). */
const face = (pos: number[], indices: number[], a: number, b: number, c: number, n: readonly [number, number, number]) => {
  const e1 = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]]
  const e2 = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]]
  const dot = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2]
  indices.push(...(dot >= 0 ? [a, b, c] : [a, c, b]))
}
const UP = [0, 1, 0] as const

/** The course's ground as triangles with a round hole for the cup: big on flat felt, FINE where it
 *  bends, crosses the outline or nears the cup, without a vertex left hanging on a neighbour's edge
 *  (a ball would catch on it). Positions are three.js-style x, y (up: the height), z (the course's y). */
export function groundMesh(hole: Hole): Mesh {
  const xs = hole.outline.map(p => p[0])
  const ys = hole.outline.map(p => p[1])
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
  let size = FINE
  while (size < Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0)) size *= 2
  const n = size / FINE
  const at = (i: number, j: number): Pt => [x0 + i * FINE, y0 + j * FINE]
  const heights = new Float64Array((n + 1) * (n + 1)).fill(NaN)
  const h = (i: number, j: number) => {
    const k = j * (n + 1) + i
    return Number.isNaN(heights[k]) ? (heights[k] = heightAt(hole, at(i, j))) : heights[k]
  }

  // The cup sits in a block of FINE cells, meshed apart: its border zipped to the rim
  const [cx, cy] = hole.cup.at
  const reach = hole.cup.r + 2 * FINE
  const [bi0, bj0] = [Math.max(0, Math.floor((cx - reach - x0) / FINE)), Math.max(0, Math.floor((cy - reach - y0) / FINE))]
  const [bi1, bj1] = [Math.min(n, Math.ceil((cx + reach - x0) / FINE)), Math.min(n, Math.ceil((cy + reach - y0) / FINE))]

  /** Whether the two triangles of cell (i, j, s cells wide) stay within TOL of the ground. */
  const flat = (i: number, j: number, s: number) => {
    const [h00, h10, h01, h11] = [h(i, j), h(i + s, j), h(i, j + s), h(i + s, j + s)]
    for (let a = 0; a <= s; a++)
      for (let b = 0; b <= s; b++) {
        const [u, v] = [a / s, b / s]
        const plane = u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11)
        if (Math.abs(h(i + a, j + b) - plane) > TOL) return false
      }
    return true
  }
  const edges = hole.outline.map((p, k) => [p, hole.outline[(k + 1) % hole.outline.length]] as const)
  /** Whether the outline runs through the cell. */
  const crosses = (i: number, j: number, s: number) => {
    const [lo, hi] = [at(i, j), at(i + s, j + s)]
    const corners: Pt[] = [lo, [hi[0], lo[1]], hi, [lo[0], hi[1]]]
    return edges.some(([a, b]) => {
      if (Math.max(a[0], b[0]) < lo[0] || Math.min(a[0], b[0]) > hi[0] || Math.max(a[1], b[1]) < lo[1] || Math.min(a[1], b[1]) > hi[1])
        return false
      const sides = corners.map(c => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])))
      return Math.min(...sides) < 0 && Math.max(...sides) > 0
    })
  }
  const leaves: [number, number, number][] = []
  const split = (i: number, j: number, s: number) => {
    const inBlock = i < bi1 && i + s > bi0 && j < bj1 && j + s > bj0
    const cross = crosses(i, j, s)
    if (!cross && !pointInPolygon(at(i + s / 2, j + s / 2), hole.outline)) return
    if (s > 1 && (inBlock || cross || !flat(i, j, s))) {
      const t = s / 2
      for (const [di, dj] of [
        [0, 0],
        [t, 0],
        [0, t],
        [t, t],
      ])
        split(i + di, j + dj, t)
    } else if (!inBlock) leaves.push([i, j, s])
  }
  split(0, 0, n)

  const pos: number[] = []
  const indices: number[] = []
  const ids = new Map<number, number>()
  const vertex = (i: number, j: number) => {
    const key = j * (n + 1) + i
    let id = ids.get(key)
    if (id === undefined) {
      id = pos.length / 3
      const [x, y] = at(i, j)
      pos.push(x, h(i, j), y)
      ids.set(key, id)
    }
    return id
  }
  const block: [number, number][] = []
  for (let i = bi0; i < bi1; i++) block.push([i, bj0], [i + 1, bj1])
  for (let j = bj0; j < bj1; j++) block.push([bi0, j + 1], [bi1, j])
  const outer = block.map(([i, j]) => vertex(i, j))
  for (const [i, j, s] of leaves)
    for (const [di, dj] of [
      [0, 0],
      [s, 0],
      [0, s],
      [s, s],
    ])
      vertex(i + di, j + dj)

  for (const [i, j, s] of leaves) {
    // Round the cell's border, with any corner of a smaller neighbour on it
    const ring: number[] = []
    const walk = (di: number, dj: number, fromI: number, fromJ: number) => {
      for (let k = 0; k < s; k++) {
        const id = ids.get((fromJ + dj * k) * (n + 1) + fromI + di * k)
        if (id !== undefined) ring.push(id)
      }
    }
    walk(1, 0, i, j)
    walk(0, 1, i + s, j)
    walk(-1, 0, i + s, j + s)
    walk(0, -1, i, j + s)
    if (ring.length === 4) {
      face(pos, indices, ring[0], ring[1], ring[3], UP)
      face(pos, indices, ring[1], ring[2], ring[3], UP)
    } else {
      const c = vertex(i + s / 2, j + s / 2)
      ring.forEach((a, k) => face(pos, indices, c, a, ring[(k + 1) % ring.length], UP))
    }
  }

  // Zip the block's border to the rim, both in order round the cup
  const angle = (id: number) => (Math.atan2(pos[id * 3 + 2] - cy, pos[id * 3] - cx) + 2 * Math.PI) % (2 * Math.PI)
  outer.sort((a, b) => angle(a) - angle(b))
  const inner = rim(hole).map(p => {
    pos.push(p[0], heightAt(hole, p), p[1])
    return pos.length / 3 - 1
  })
  const turn = (ring: number[], k: number) => angle(ring[k % ring.length]) + (k >= ring.length ? 2 * Math.PI : 0)
  for (let a = 0, b = 0; a < outer.length || b < inner.length;) {
    const o = outer[a % outer.length]
    const r = inner[b % inner.length]
    if (b >= inner.length || (a < outer.length && turn(outer, a + 1) < turn(inner, b + 1))) {
      face(pos, indices, o, outer[(a + 1) % outer.length], r, UP)
      a++
    } else {
      face(pos, indices, o, inner[(b + 1) % inner.length], r, UP)
      b++
    }
  }
  // Clipped to the outline, as drawn and as the ball meets it
  const kept: number[] = []
  for (let t = 0; t < indices.length; t += 3) {
    const v = [indices[t], indices[t + 1], indices[t + 2]]
    const mid: Pt = [(pos[v[0] * 3] + pos[v[1] * 3] + pos[v[2] * 3]) / 3, (pos[v[0] * 3 + 2] + pos[v[1] * 3 + 2] + pos[v[2] * 3 + 2]) / 3]
    if (pointInPolygon(mid, hole.outline)) kept.push(...v)
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(kept) }
}

/** The cup below the ground's hole: walls from the rim down to a floor CUP_DEPTH under its middle,
 *  facing in. Its rim points are groundMesh's, so the two join up. */
export function cupMesh(hole: Hole): Mesh {
  const [cx, cy] = hole.cup.at
  const floor = heightAt(hole, hole.cup.at) - CUP_DEPTH
  const pos: number[] = [cx, floor, cy]
  for (const p of rim(hole)) pos.push(p[0], heightAt(hole, p), p[1], p[0], floor, p[1])
  const indices: number[] = []
  for (let k = 0; k < RIM; k++) {
    const [top, bottom] = [1 + 2 * k, 2 + 2 * k]
    const [top2, bottom2] = [1 + 2 * ((k + 1) % RIM), 2 + 2 * ((k + 1) % RIM)]
    const a = (k / RIM) * 2 * Math.PI
    const inward = [-Math.cos(a + Math.PI / RIM), 0, -Math.sin(a + Math.PI / RIM)] as const
    face(pos, indices, top, bottom, top2, inward)
    face(pos, indices, top2, bottom, bottom2, inward)
    face(pos, indices, 0, bottom, bottom2, UP)
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(indices) }
}
