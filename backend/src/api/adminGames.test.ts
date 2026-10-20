import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { adminGamesApiPlugin } from './adminGames.js'
import type { HistoryGame } from '../db/history.js'
import type { AdminGame } from '../db/adminGames.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'admin-1'
    done()
  }),
}))
vi.mock('../auth/admin.js', () => ({
  requireAdmin: vi.fn((_req: any, _reply: any, done: () => void) => done()),
}))
vi.mock('../db/history.js', () => ({ getFinishedGame: vi.fn() }))
vi.mock('../db/adminGames.js', () => ({ listAllGames: vi.fn() }))
vi.mock('../db/queries.js', () => ({ getSessionEvents: vi.fn().mockResolvedValue([]) }))

import * as adminGames from '../db/adminGames.js'
import * as history from '../db/history.js'
import * as admin from '../auth/admin.js'

const row = (o: Partial<AdminGame> = {}): AdminGame => ({
  id: 'g1',
  game_id: 'x01',
  status: 'aborted',
  config: {},
  created_at: new Date('2026-10-01T09:00:00Z'),
  finished_at: null,
  board: null,
  ranked: false,
  seats: [{ seat: 0, name: 'Ann', user_id: 'u1', bot_level: null, placement: null, forfeited: false }],
  ...o,
})

const finished = (): HistoryGame => ({
  id: 'g1',
  game_id: 'x01',
  config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3, bullOff: 'off', bullValue: '25_50', maxRounds: 50 },
  rng_seed: 0,
  created_at: new Date('2026-10-01T09:00:00Z'),
  finished_at: new Date('2026-10-01T09:30:00Z'),
  board: null,
  mySeat: null,
  seats: [
    { seat: 0, name: 'Ann', user_id: 'u1', bot_level: null, placement: 1, throw_position: 0, stats: {}, forfeited: false },
    { seat: 1, name: 'Bob', user_id: 'u2', bot_level: null, placement: 2, throw_position: 1, stats: {}, forfeited: false },
  ],
})

function makeApp() {
  const app = createFastify()
  app.register(adminGamesApiPlugin, { db: {} as any })
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('admin games API', () => {
  it('is admin-only', async () => {
    vi.mocked(admin.requireAdmin).mockImplementation((_req: any, reply: any) => reply.code(403).send({ error: 'forbidden' }))
    expect((await makeApp().inject({ method: 'GET', url: '/api/admin/games' })).statusCode).toBe(403)
    expect((await makeApp().inject({ method: 'GET', url: '/api/admin/games/g1' })).statusCode).toBe(403)
    vi.mocked(admin.requireAdmin).mockImplementation((_req: any, _reply: any, done: () => void) => done())
  })

  it('lists finished games by default and passes the filters on', async () => {
    vi.mocked(adminGames.listAllGames).mockResolvedValue({ games: [row({ status: 'finished', ranked: true })], next: null })
    const res = await makeApp().inject({
      method: 'GET',
      url: '/api/admin/games?mode=x01&player=ann&ranked=true&from=2026-10-01T00:00:00Z&limit=10',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      games: [{ id: 'g1', status: 'finished', ranked: true, finishedAt: null, players: [{ userId: 'u1', placement: null }] }],
      nextCursor: null,
    })
    expect(vi.mocked(adminGames.listAllGames).mock.calls[0]?.[1]).toEqual({
      status: 'finished',
      mode: 'x01',
      player: 'ann',
      board: undefined,
      ranked: true,
      from: new Date('2026-10-01T00:00:00Z'),
      to: undefined,
    })
    expect(vi.mocked(adminGames.listAllGames).mock.calls[0]?.[2]).toMatchObject({ limit: 10, after: null })
  })

  it('answers a cursor it did not make with 400', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/admin/games?cursor=nope' })
    expect(res.statusCode).toBe(400)
  })

  it('returns a finished game with every seat account id, to someone who did not play', async () => {
    vi.mocked(history.getFinishedGame).mockResolvedValue(finished())
    const res = await makeApp().inject({ method: 'GET', url: '/api/admin/games/g1' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.game.mySeat).toBeNull()
    expect(body.game.players.map((p: any) => p.userId)).toEqual(['u1', 'u2'])
    expect(body.detail.mode).toBe('x01')
  })

  it('404s a game with no result (unknown, aborted or active)', async () => {
    vi.mocked(history.getFinishedGame).mockResolvedValue(undefined)
    expect((await makeApp().inject({ method: 'GET', url: '/api/admin/games/g1' })).statusCode).toBe(404)
  })
})
