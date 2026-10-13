// A benchmark, not in the default run (`npm run test:perf`): timings flake under the parallel suite.
import { beforeAll, it, expect } from 'vitest'
import { initPhysics3d, simulateShot3d } from './physics3d.js'
import { testCourse } from '../courses/test.js'
import { DEFAULT_PHYSICS as P } from '../physics.js'

/** Per full-power shot, ms: a real cup and ground matter more than speed; the shot cache plays each dart once. */
const SHOT_LIMIT = 150

beforeAll(() => initPhysics3d())

it(`plays a full-power shot on every test hole in under ${SHOT_LIMIT} ms`, () => {
  for (const h of testCourse.holes) {
    simulateShot3d(h, P, h.tee, { dir: [0, -1], power: 1 }) // warm up
    // The fastest of 10, so a passing hiccup on the machine can't fail it
    let fastest = Infinity
    for (let k = 0; k < 10; k++) {
      const t0 = performance.now()
      simulateShot3d(h, P, h.tee, { dir: [0, -1], power: 1 })
      fastest = Math.min(fastest, performance.now() - t0)
    }
    expect(fastest, h.id).toBeLessThan(SHOT_LIMIT)
  }
})
