import { beforeAll, describe, expect, it } from 'vitest'
import { distanceField, testHole } from './bot.js'
import { initPhysics3d } from './3d/physics3d.js'
import { testCourse } from './courses/test.js'
import { DEFAULT_PHYSICS as P } from './physics.js'
import type { Hole } from './types.js'

beforeAll(() => initPhysics3d())

const straight = testCourse.holes.find(h => h.id === 'test-straight')! as Hole
/** The straight hole with its cup walled in by a closed square. */
const walledIn: Hole = {
  ...straight,
  walls: [
    {
      points: [
        [100, 150],
        [400, 150],
        [400, 450],
        [100, 450],
      ],
      closed: true,
    },
  ],
}

describe('distanceField', () => {
  it('is the distance along the felt to the cup, Infinity off it', () => {
    const d = distanceField(straight)
    expect(d([250, 1300])).toBeCloseTo(1000, -2)
    expect(d([-100, 1300])).toBe(Infinity)
  })

  it('goes around a wall', () => {
    // A wall across the lane, open at its right end only
    const hole: Hole = {
      ...straight,
      walls: [
        {
          points: [
            [0, 1000],
            [400, 1000],
          ],
        },
      ],
    }
    expect(distanceField(hole)([100, 1100])).toBeGreaterThan(800 + 300)
    expect(distanceField(walledIn)(straight.tee)).toBe(Infinity)
  })
})

describe('testHole', () => {
  it('reaches the cup on a straight hole with par 2 or 3, the same for the same seed', () => {
    const a = testHole(straight, P, { rounds: 6, seed: 1, maxStrokes: 6 })
    expect(a.reached).toBe(6)
    expect(a.rounds).toBe(6)
    expect([2, 3]).toContain(a.suggestedPar)
    expect(testHole(straight, P, { rounds: 6, seed: 1, maxStrokes: 6 })).toEqual(a)
  })

  it('never reaches a walled-in cup', () => {
    const r = testHole(walledIn, P, { rounds: 2, seed: 1, maxStrokes: 3 })
    expect(r.reached).toBe(0)
    expect(r.strokes).toEqual([3, 3])
  })
})
