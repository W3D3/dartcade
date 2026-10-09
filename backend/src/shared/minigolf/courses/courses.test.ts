// Golden shots: if a nape, Node or physics change moves a ball, this fails. Changing the
// physics on purpose means updating the snapshot (`npx vitest -u`) in the same commit.
import { describe, it, expect } from 'vitest'
import { validateHole } from '../hole.js'
import { DEFAULT_PHYSICS } from '../physics.js'
import { simulateShot } from '../simulate.js'
import type { Shot } from '../types.js'
import { COURSES, mixedHoles } from './index.js'

const SHOTS: Shot[] = [
  { dir: [0, -1], power: 0.3 },
  { dir: [0, -1], power: 0.9 },
  { dir: [0.6, -0.8], power: 0.6 },
  { dir: [-0.8, -0.6], power: 1 },
  { dir: [1, 0], power: 0.45 },
]

describe('courses', () => {
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
