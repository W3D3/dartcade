import { describe, it, expect } from 'vitest'
import { G, groundMesh, heightAt, heightGrid } from './ground.js'
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
    const { positions, indices } = groundMesh(hole, 50)
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

  it('cuts the cup out round: every ground point stays on or outside its rim', () => {
    const { positions } = groundMesh(hole, 20)
    const d = (k: number) => Math.hypot(positions[k * 3] - 200, positions[k * 3 + 2] - 200)
    const ds = [...Array(positions.length / 3).keys()].map(d)
    expect(Math.min(...ds)).toBeGreaterThanOrEqual(54 - 1e-3)
    // ... and the rim is lined with points, not left ragged
    expect(ds.filter(x => x < 54 + 1e-3).length).toBeGreaterThan(12)
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

  it('lays the heights out on a grid, row by row', () => {
    const g = heightGrid(hole, 50)
    expect([g.x0, g.y0, g.nx, g.ny]).toEqual([0, 0, 20, 20])
    // Row 6 (y = 300), column 10 (x = 500): the hill's top
    expect(g.heights[6 * 21 + 10]).toBeCloseTo(heightAt(hole, [500, 300]))
  })
})
