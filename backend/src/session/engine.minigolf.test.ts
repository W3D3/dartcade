import { afterAll, expect, it, vi } from 'vitest'
import { SessionEngine, type EngineStore } from './engine.js'
import { minigolfModule as M, type MinigolfState } from '../games/minigolf.js'
import { closePool, simulateInPool } from '../games/minigolfPool.js'
import { simulateShot3d } from '../shared/minigolf/3d/physics3d.js'
import { testCourse } from '../shared/minigolf/courses/test.js'
import { DEFAULT_PHYSICS as P } from '../shared/minigolf/physics.js'
import type { StoredGameSession } from '../db/queries.js'

vi.mock('../games/minigolfPool.js', async orig => {
  const m = await orig<typeof import('../games/minigolfPool.js')>()
  return { ...m, simulateInPool: vi.fn(m.simulateInPool) }
})
afterAll(() => closePool())

const store = () =>
  ({
    insertSession: vi.fn().mockResolvedValue(undefined),
    getActiveSessions: vi.fn().mockResolvedValue([]),
    getSessionEvents: vi.fn().mockResolvedValue([]),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    insertDarts: vi.fn().mockResolvedValue(undefined),
    deleteDarts: vi.fn().mockResolvedValue(undefined),
    finishSession: vi.fn().mockResolvedValue(undefined),
    abortSession: vi.fn().mockResolvedValue(undefined),
  }) satisfies EngineStore
const config = { ...M.defaultConfig, course: 'test' }
const dart = (x: number, y: number) => ({
  visit_id: 'v',
  index: 0,
  source_seq: 1,
  dart: { segment: { number: 20, bed: 'SingleOuter', multiplier: 1, name: 'S20' }, score: 20, coords: { x, y } },
})
const lastTry = (state: unknown) => (state as MinigolfState).tries.at(-1)!
const direct = (state: unknown) => {
  const t = lastTry(state)
  const hole = testCourse.holes[0]
  return simulateShot3d(hole, P, hole.tee, { dir: t.dir!, power: t.power! })
}

it('plays a live 3D dart in the pool, with the same result as a direct call', async () => {
  vi.mocked(simulateInPool).mockClear()
  const engine = new SessionEngine(store(), () => undefined)
  const { sessionId } = await engine.create('user-1', 'board-1', 'minigolf', config, [{ name: 'Alice' }])
  await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v' })
  await engine.onBridgeEvent('board-1', 'dart.detected', dart(0.11, -0.93))
  const state = engine.getSession(sessionId)!.currentState
  expect(simulateInPool).toHaveBeenCalledTimes(1)
  expect(lastTry(state).result).toEqual(direct(state))
  expect(engine.getSession(sessionId)!.openDarts).toHaveLength(1)
})

it('rebuilds a logged game inline, without the pool', async () => {
  vi.mocked(simulateInPool).mockClear()
  const s = store()
  const row: StoredGameSession = {
    id: 'g-1',
    owner_user_id: 'user-1',
    board_db_id: 'board-1',
    game_id: 'minigolf',
    game_version: M.version,
    rng_seed: 1,
    config,
    created_at: new Date(),
    players: [
      { name: 'Alice', user_id: 'user-1', controller_user_id: 'user-1', board_db_id: 'board-1', board_name: null, bot_level: null },
    ],
    lobby_id: null,
    lobby_name: null,
  }
  s.getActiveSessions.mockResolvedValue([row])
  s.getSessionEvents.mockResolvedValue([
    { seq: 0, source: 'board', kind: 'visit.opened', data: { visit_id: 'v' }, created_at: new Date() },
    { seq: 1, source: 'board', kind: 'dart.detected', data: dart(-0.21, 0.9), created_at: new Date() },
  ])
  const engine = new SessionEngine(s, () => undefined)
  await engine.rebuild()
  const state = engine.getSession('g-1')!.currentState
  expect(simulateInPool).not.toHaveBeenCalled()
  expect(lastTry(state).result).toEqual(direct(state))
})
