import { describe, it, expect } from 'vitest'
import { CUP_DEPTH, G, cupMesh, groundMesh, heightAt } from './ground.js'
import { testCourse } from '../courses/test.js'
import type { Hole } from '../types.js'

const hole: Hole = {
  id: 'h',
  name: 'H',
  par: 3,
  outline: [
    [0, 0],
    [1000, 0],
    [1000, 1000],
    [0, 1000],
  ],
  walls: [],
  bumpers: [],
  slopes: [
    { radial: { center: [500, 300], radius: 200, strength: 1500 } },
    { bump: { from: [0, 800], to: [1000, 800], width: 100, strength: -500 } },
  ],
  tee: [500, 950],
  cup: { at: [200, 200], r: 54 },
}

describe('minigolf ground', () => {
  it('rises so steeply that gravity pushes as hard as the slope does', () => {
    // A hill: strength / g per mm, from nothing at its edge to its top
    expect(heightAt(hole, [500, 300])).toBeCloseTo((1500 / G) * 200)
    expect(heightAt(hole, [600, 300])).toBeCloseTo((1500 / G) * 100)
    expect(heightAt(hole, [800, 300])).toBe(0)
    // A negative bump is a trench
    expect(heightAt(hole, [300, 800])).toBeCloseTo((-500 / G) * 100)
  })

  it('covers the course, leaving the cup open', () => {
    const { positions, indices } = groundMesh(hole)
    const tris = indices.length / 3
    let area = 0
    for (let t = 0; t < tris; t++) {
      const [a, b, c] = [0, 1, 2].map(k => indices[t * 3 + k] * 3)
      // Nothing covers the cup's middle: it's on the same side of no triangle's three edges
      const side = (p: number, q: number) =>
        Math.sign((positions[q] - positions[p]) * (200 - positions[p + 2]) - (positions[q + 2] - positions[p + 2]) * (200 - positions[p]))
      expect(Math.abs(side(a, b) + side(b, c) + side(c, a))).toBeLessThan(3)
      area +=
        Math.abs(
          (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]) -
            (positions[c] - positions[a]) * (positions[b + 2] - positions[a + 2]),
        ) / 2
    }
    // The whole square, less about the cup
    expect(area).toBeGreaterThan(1000 * 1000 - 3 * 54 * 54 * Math.PI)
    expect(area).toBeLessThan(1000 * 1000)
    // Heights sit in y (three.js is y up), course y in z
    const i = [...Array(positions.length / 3).keys()].find(k => positions[k * 3] === 500 && positions[k * 3 + 2] === 300)
    expect(i).toBeDefined()
    expect(positions[i! * 3 + 1]).toBeCloseTo(heightAt(hole, [500, 300]))
  })

  it('cuts the cup out round: every ground point stays on or outside its rim, and the rim is a ring of points', () => {
    const { positions } = groundMesh(hole)
    const d = (k: number) => Math.hypot(positions[k * 3] - 200, positions[k * 3 + 2] - 200)
    const ds = [...Array(positions.length / 3).keys()].map(d)
    expect(Math.min(...ds)).toBeGreaterThanOrEqual(54 - 1e-3)
    expect(ds.filter(x => x < 54 + 1e-3).length).toBe(48)
  })

  it('follows the heights closely with big triangles on flat felt and small ones where it bends', () => {
    for (const h of [hole, ...testCourse.holes]) {
      const { positions: p, indices } = groundMesh(h)
      let worst = 0
      let biggest = 0
      for (let t = 0; t < indices.length; t += 3) {
        const v = [0, 1, 2].map(k => indices[t + k] * 3)
        // The middle and the edges' midpoints of every triangle
        for (const w of [
          [1, 1, 1],
          [1, 1, 0],
          [0, 1, 1],
          [1, 0, 1],
        ]) {
          const n = w[0] + w[1] + w[2]
          const at = (o: number) => (w[0] * p[v[0] + o] + w[1] * p[v[1] + o] + w[2] * p[v[2] + o]) / n
          worst = Math.max(worst, Math.abs(at(1) - heightAt(h, [at(0), at(2)])))
        }
        biggest = Math.max(biggest, Math.abs(p[v[1]] - p[v[0]]), Math.abs(p[v[2]] - p[v[0]]))
      }
      // A crease inside one FINE cell is cut off: up to 10 mm at the Mesa's cliffs; under 2 mm at a
      // slope's foot or ridge (a 20 % slope cuts about 1.3 mm), within the 2 mm the physics allows
      expect(worst, h.id).toBeLessThan(h.terrain ? 10 : 2)
      if (h !== hole) expect(biggest, h.id).toBeGreaterThanOrEqual(160)
      expect(indices.length / 3, h.id).toBeLessThan(6000)
    }
  })

  it('sinks the cup from its rim to a floor CUP_DEPTH below its middle, walls facing in', () => {
    const { positions: p, indices } = cupMesh(hole)
    const floor = heightAt(hole, [200, 200]) - CUP_DEPTH
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map(k => indices[t + k] * 3)
      const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
      const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
      const mid = [(p[a] + p[b] + p[c]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3]
      // A wall faces the cup's middle, the floor faces up
      if (Math.abs(n[1]) < 1e-6) expect(n[0] * (200 - mid[0]) + n[2] * (200 - mid[1])).toBeGreaterThan(0)
      else expect(n[1]).toBeGreaterThan(0)
    }
    const ys = [...Array(p.length / 3).keys()].map(k => p[k * 3 + 1])
    expect(Math.min(...ys)).toBeCloseTo(floor)
  })

  it('raises a mesa, falling away over each side’s own width: a ramp on one, cliffs on the rest', () => {
    const mesa: Hole = {
      ...hole,
      slopes: [],
      terrain: [{ mesa: { from: [300, 300], to: [700, 500], height: 150, edges: [50, 50, 50, 400] } }],
    }
    expect(heightAt(mesa, [500, 400])).toBe(150)
    // Halfway down the ramp below its bottom side, and a cliff's width off its left side
    expect(heightAt(mesa, [500, 700])).toBeCloseTo(75)
    expect(heightAt(mesa, [250, 400])).toBeCloseTo(0)
    expect(heightAt(mesa, [275, 400])).toBeCloseTo(75)
    expect(heightAt(mesa, [500, 950])).toBe(0)
  })
})
