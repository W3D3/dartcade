// Issue #214: opening a finished 3D minigolf game simulated every shot on the main thread
import { afterAll, expect, it, vi } from 'vitest'
import { buildDetail } from './detail.js'
import { newSession, replay, replayPooled, type LoggedInput } from '../session/replay.js'
import { minigolfModule as M, type MinigolfState } from '../games/minigolf.js'
import { closePool, simulateInPool } from '../games/minigolfPool.js'
import { simulateShot3d } from '../shared/minigolf/3d/physics3d.js'
import type { HistoryGame } from '../db/history.js'

vi.mock('../shared/minigolf/3d/physics3d.js', async orig => {
  const m = await orig<typeof import('../shared/minigolf/3d/physics3d.js')>()
  return { ...m, simulateShot3d: vi.fn(m.simulateShot3d) }
})
vi.mock('../games/minigolfPool.js', async orig => {
  const m = await orig<typeof import('../games/minigolfPool.js')>()
  return { ...m, simulateInPool: vi.fn(m.simulateInPool) }
})
afterAll(() => closePool())

const config = { ...M.defaultConfig, course: 'test' }
const at = new Date('2026-10-01T10:00:00.000Z')
const game: HistoryGame = {
  id: 'g-mg',
  game_id: 'minigolf',
  config,
  rng_seed: 1,
  created_at: at,
  finished_at: at,
  board: null,
  mySeat: 0,
  seats: [{ seat: 0, name: 'A', user_id: 'u1', bot_level: null, placement: 1, throw_position: 0, stats: {}, forfeited: false }],
}
const dart = (index: number, x: number, y: number) => ({
  visit_id: 'v',
  index,
  source_seq: index + 1,
  dart: { segment: { number: 20, bed: 'SingleOuter', multiplier: 1, name: 'S20' }, score: 20, coords: { x, y } },
})
const log: LoggedInput[] = [
  { kind: 'visit.opened', data: { visit_id: 'v' } },
  { kind: 'dart.detected', data: dart(0, 0.13, -0.91) },
  { kind: 'dart.detected', data: dart(1, -0.24, 0.88) },
  { kind: 'dart.detected', data: dart(2, 0.41, -0.62) },
].map((e, seq) => ({ seq, source: 'board', created_at: at, ...e }))
const session = () =>
  newSession({
    id: game.id,
    ownerUserId: '',
    boardId: null,
    module: M,
    config,
    seats: [{ name: 'A', userId: null, controllerUserId: '', boardId: null, boardName: null, bot: null }],
    seed: game.rng_seed,
    createdAt: at,
  })

it('builds a 3D game detail without simulating a shot on the main thread', { timeout: 30_000 }, async () => {
  const built = await buildDetail(game, log, vi.fn())
  expect(simulateShot3d).not.toHaveBeenCalled()
  expect(simulateInPool).toHaveBeenCalled()
  expect(built?.detail).toMatchObject({ mode: 'minigolf' })

  // The pooled shots stayed out of the shared cache, so the old inline replay simulates them
  // itself here, and lands on the same game
  const pooled = session()
  await replayPooled(pooled, log, vi.fn())
  const inline = session()
  replay(inline, log, vi.fn())
  expect(simulateShot3d).toHaveBeenCalled()
  const tries = (pooled.currentState as MinigolfState).tries
  expect(tries.length).toBeGreaterThan(0)
  expect(tries.every(t => t.result)).toBe(true)
  expect(pooled.currentState).toEqual(inline.currentState)
  expect(pooled.committedState).toEqual(inline.committedState)
})
