// Golden shots: if a nape, Rapier, Node or physics change moves a ball, this fails. Changing the
// physics on purpose means updating the snapshot (`npx vitest -u`) in the same commit.
import { beforeAll, describe, it, expect } from 'vitest'
import { initPhysics3d, simulateShot3d } from '../3d/physics3d.js'
import { pointInPolygon } from '../geometry.js'
import { validateHole } from '../hole.js'
import { DEFAULT_PHYSICS } from '../physics.js'
import { simulateShot } from '../simulate.js'
import type { Shot } from '../types.js'
import { COURSES, mixedHoles } from './index.js'

const SHOTS: Shot[] = [
  { dir: [0, -1], power: 0.3 },
  { dir: [0, -1], power: 0.75 }, // onto the Mesa's plateau, short of the cup
  { dir: [0, -1], power: 0.9 },
  { dir: [0.6, -0.8], power: 0.6 },
  { dir: [-0.8, -0.6], power: 1 },
  { dir: [1, 0], power: 0.45 },
]

describe('courses', () => {
  beforeAll(() => initPhysics3d())

  for (const course of COURSES) {
    for (const hole of course.holes) {
      it(`${course.id}/${hole.id} is valid`, () => expect(validateHole(hole)).toEqual([]))
      it(`${course.id}/${hole.id} golden shots`, () => {
        const results = SHOTS.map(s => {
          const r = simulateShot(hole, DEFAULT_PHYSICS, hole.tee, s)
          return { rest: r.rest.map(n => Math.round(n * 1000) / 1000), holed: r.holed, samples: r.path.length }
        })
        expect(results).toMatchSnapshot()
      })
      it(`${course.id}/${hole.id} 3D golden shots`, () => {
        const results = SHOTS.map(s => {
          const r = simulateShot3d(hole, DEFAULT_PHYSICS, hole.tee, s)
          // No ball stops hanging over the hole, and none leaves the course
          if (!r.holed) {
            expect(Math.hypot(r.rest[0] - hole.cup.at[0], r.rest[1] - hole.cup.at[1])).toBeGreaterThanOrEqual(hole.cup.r)
            expect(pointInPolygon(r.rest, hole.outline)).toBe(true)
          }
          let length = 0
          for (let i = 1; i < r.path.length; i++) {
            const [a, b] = [r.path[i - 1], r.path[i]]
            length += Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0))
          }
          const round = (n: number) => Math.round(n * 1000) / 1000
          return { rest: r.rest.map(round), holed: r.holed, hits: r.hits.map(round), length: Math.round(length * 10) / 10 }
        })
        expect(results).toMatchSnapshot()
      })
    }
  }

  it('draws mixed holes from every course without repeats', () => {
    let seed = 1
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const holes = mixedHoles(rng)
    const all = COURSES.flatMap(c => c.holes)
    expect(holes.length).toBe(Math.min(9, all.length))
    expect(new Set(holes.map(h => h.id)).size).toBe(holes.length)
  })

  it('gives every hole an id unique across courses', () => {
    const ids = COURSES.flatMap(c => c.holes.map(h => h.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
