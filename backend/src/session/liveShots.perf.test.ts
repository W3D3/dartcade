// A timing test, not in the default run (`npm run test:perf`): the parallel suite delays timers itself.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { SessionEngine } from './engine.js'
import { minigolfModule as M, type MinigolfState } from '../games/minigolf.js'
import { closePool, simulateInPool } from '../games/minigolfPool.js'
import { initPhysics3d } from '../shared/minigolf/3d/physics3d.js'
import { testCourse } from '../shared/minigolf/courses/test.js'
import { DEFAULT_PHYSICS as P } from '../shared/minigolf/physics.js'

beforeAll(() => initPhysics3d())
afterAll(() => closePool())

const store = () => ({
  insertSession: vi.fn().mockResolvedValue(undefined),
  getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]),
  appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined),
  deleteDarts: vi.fn().mockResolvedValue(undefined),
  finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
})

it('keeps the event loop free while a live full-power 3D shot simulates', async () => {
  // The pool's worker is up and warm, as it is after the first dart
  const hole = testCourse.holes[0]
  await simulateInPool({ hole, physics: P, ball: hole.tee, shot: { dir: [0, -1], power: 1 }, others: [] })
  const engine = new SessionEngine(store(), () => undefined)
  const { sessionId } = await engine.create('user-1', 'board-1', 'minigolf', { ...M.defaultConfig, course: 'test' }, [{ name: 'Alice' }])
  await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v' })

  let last = performance.now()
  let worst = 0
  const timer = setInterval(() => {
    const now = performance.now()
    worst = Math.max(worst, now - last - 10)
    last = now
  }, 10)
  const t0 = performance.now()
  await engine.onBridgeEvent('board-1', 'dart.detected', {
    visit_id: 'v',
    index: 0,
    source_seq: 1,
    dart: { segment: { number: 20, bed: 'Double', multiplier: 2, name: 'D20' }, score: 40, coords: { x: 0.02, y: 0.995 } },
  })
  const took = performance.now() - t0
  // A tick held up by the shot fires only once the loop is free again
  await new Promise(r => setTimeout(r, 30))
  clearInterval(timer)
  expect((engine.getSession(sessionId)!.currentState as MinigolfState).tries).toHaveLength(1)
  console.log(`live dart took ${took.toFixed(1)} ms; worst timer delay ${worst.toFixed(1)} ms`)
  expect(worst).toBeLessThan(20)
})
