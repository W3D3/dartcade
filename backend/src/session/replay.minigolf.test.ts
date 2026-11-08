// A stored minigolf game must replay to the same final state whichever way it is replayed, and
// whatever the engine's shot machinery looks like: GOLDEN was taken before the shots moved behind
// the GameModule contract (#550). It hashes the whole final state, every path point included.
import { createHash } from 'node:crypto'
import { afterAll, expect, it, vi } from 'vitest'
import { newSession, replay, replayPooled, type LoggedInput } from './replay.js'
import { games } from '../games/index.js'
import { minigolfModule as M } from '../games/minigolf.js'
import { closePool } from '../games/minigolfPool.js'

afterAll(() => closePool())

// The registered module, which carries the pool (minigolfModule alone replays inline)
const registered = games.minigolf
if (!registered) throw new Error('minigolf is not registered')
const config = { ...M.defaultConfig, course: 'test' }
const at = new Date('2026-10-01T10:00:00.000Z')
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
  { kind: 'takeout.finished', data: {} },
  { kind: 'visit.opened', data: { visit_id: 'w' } },
  { kind: 'dart.detected', data: dart(0, -0.3, -0.8) },
  { kind: 'dart.detected', data: dart(1, 0.05, 0.95) },
  { kind: 'takeout.finished', data: {} },
].map((e, seq) => ({ seq, source: 'board', created_at: at, ...e }))

const fresh = () =>
  newSession({
    id: 'g-replay',
    ownerUserId: '',
    boardId: null,
    module: registered,
    config,
    seats: [
      { name: 'A', userId: null, controllerUserId: '', boardId: null, boardName: null, bot: null },
      { name: 'B', userId: null, controllerUserId: '', boardId: null, boardName: null, bot: null },
    ],
    seed: 7,
    createdAt: at,
  })

const GOLDEN = '47ccc3a1a282b0ffbc2855cf83014b38efa9b6ddd82063e6663ad014804a00cb'

const final = (s: ReturnType<typeof fresh>, r: { visits: unknown[]; won: boolean }) =>
  JSON.stringify({ committed: s.committedState, current: s.currentState, visits: r.visits, won: r.won, nextSeq: s.nextSeq })
const hash = (out: string) => createHash('sha256').update(out).digest('hex')

it('replays a stored game to the recorded final state, inline and pooled', { timeout: 30_000 }, async () => {
  const inline = fresh()
  const inlineOut = final(inline, replay(inline, log, vi.fn()))
  expect(hash(inlineOut)).toBe(GOLDEN)

  const pooled = fresh()
  expect(hash(final(pooled, await replayPooled(pooled, log, vi.fn())))).toBe(GOLDEN)
})
