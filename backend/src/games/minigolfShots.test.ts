import { expect, it } from 'vitest'
import { cachedShot, liveShots, ShotNeeded, storeShot } from './minigolfShots.js'
import { simulateShot3d } from '../shared/minigolf/3d/physics3d.js'
import { testCourse } from '../shared/minigolf/courses/test.js'
import { DEFAULT_PHYSICS as P } from '../shared/minigolf/physics.js'
import type { Shot } from '../shared/minigolf/types.js'

const hole = testCourse.holes[0]
const shot = (power: number): Shot => ({ dir: [0, -1], power })

it('simulates inline outside live play (the startup rebuild, replays)', () => {
  expect(cachedShot(hole, P, hole.tee, shot(0.31), [], '3d')).toEqual(simulateShot3d(hole, P, hole.tee, shot(0.31)))
})

it('asks for a missing 3D shot in live play, and finds it once stored', () => {
  const err = (() => {
    try {
      liveShots(() => cachedShot(hole, P, hole.tee, shot(0.32), [], '3d'))
    } catch (e) {
      return e
    }
  })()
  expect(err).toBeInstanceOf(ShotNeeded)
  const inputs = (err as ShotNeeded).inputs
  expect(inputs).toEqual({ hole, physics: P, ball: hole.tee, shot: shot(0.32), others: [] })
  const result = simulateShot3d(hole, P, hole.tee, shot(0.32))
  storeShot(inputs, result)
  expect(liveShots(() => cachedShot(hole, P, hole.tee, shot(0.32), [], '3d'))).toBe(result)
})

it('plays 2D shots inline even in live play', () => {
  expect(liveShots(() => cachedShot(hole, P, hole.tee, shot(0.33), [], '2d')).rest).toBeDefined()
})
