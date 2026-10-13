import { afterAll, expect, it } from 'vitest'
import { closePool, simulateInPool, warmPool } from './minigolfPool.js'
import { simulateShot3d } from '../shared/minigolf/3d/physics3d.js'
import { testCourse } from '../shared/minigolf/courses/test.js'
import { DEFAULT_PHYSICS as P } from '../shared/minigolf/physics.js'
import type { Shot } from '../shared/minigolf/types.js'

afterAll(() => closePool())

const shots: Shot[] = [
  { dir: [0, -1], power: 1 },
  { dir: [0.6, -0.8], power: 0.4 },
  { dir: [-0.28, 0.96], power: 0.75 },
]

// Generous timeout: the workers start (and load Rapier) inside the test, under the parallel suite's load
it('plays every shot exactly as a direct call does', { timeout: 30_000 }, async () => {
  const cases = testCourse.holes.flatMap(hole =>
    shots.map(shot => ({ hole, physics: P, ball: hole.tee, shot, others: [{ id: 1, at: hole.cup.at }] })),
  )
  const pooled = await Promise.all(cases.map(simulateInPool))
  cases.forEach((c, i) => expect(pooled[i], c.hole.id).toEqual(simulateShot3d(c.hole, c.physics, c.ball, c.shot, c.others)))
})

// The first live dart after a start mustn't wait for a worker to start and load Rapier (~1–2 s)
it('starts a worker before the first shot', { timeout: 30_000 }, async () => {
  await closePool()
  const pool = warmPool()
  await expect.poll(() => pool.threads.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)
})
