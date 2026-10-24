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
  requireModerator: vi.fn((_req: any, _reply: any, done: () => void) => done()),
  requireAdmin: vi.fn((_req: any, _reply: any, done: () => void) => done()),
}))
vi.mock('../db/history.js', () => ({ getFinishedGame: vi.fn() }))
vi.mock('../db/adminGames.js', () => ({
  listAllGames: vi.fn(),
  invalidateGame: vi.fn(),
  restoreGame: vi.fn(),
  deleteGame: vi.fn(),
  getInvalidation: vi.fn().mockResolvedValue(null),
}))
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
  invalidated: null,
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
  invalidated: false,
  seats: [
    {
      seat: 0,
      name: 'Ann',
      user_id: 'u1',
      avatar: { kind: 'none' },
      bot_level: null,
      placement: 1,
      throw_position: 0,
      stats: {},
      forfeited: false,
    },
    {
      seat: 1,
      name: 'Bob',
      user_id: 'u2',
      avatar: { kind: 'none' },
      bot_level: null,
      placement: 2,
      throw_position: 1,
      stats: {},
      forfeited: false,
    },
  ],
})

function makeApp() {
  const app = createFastify()
  app.register(adminGamesApiPlugin, { db: {} as any })
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('admin games API', () => {
  it('is for admins and moderators only', async () => {
    vi.mocked(admin.requireModerator).mockImplementation((_req: any, reply: any) => reply.code(403).send({ error: 'forbidden' }))
    expect((await makeApp().inject({ method: 'GET', url: '/api/admin/games' })).statusCode).toBe(403)
    expect((await makeApp().inject({ method: 'GET', url: '/api/admin/games/g1' })).statusCode).toBe(403)
    expect((await makeApp().inject({ method: 'POST', url: '/api/admin/games/g1/invalidate', payload: {} })).statusCode).toBe(403)
    expect(adminGames.invalidateGame).not.toHaveBeenCalled()
    expect((await makeApp().inject({ method: 'POST', url: '/api/admin/games/g1/restore' })).statusCode).toBe(403)
    expect(adminGames.restoreGame).not.toHaveBeenCalled()
    vi.mocked(admin.requireModerator).mockImplementation((_req: any, _reply: any, done: () => void) => done())
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

  it('lists who invalidated a game, when and why', async () => {
    vi.mocked(adminGames.listAllGames).mockResolvedValue({
      games: [
        row({
          status: 'finished',
          invalidated: { at: new Date('2026-10-02T10:00:00Z'), by: { id: 'm1', name: 'Mo' }, reason: 'Board was misreading' },
        }),
      ],
      next: null,
    })
    const res = await makeApp().inject({ method: 'GET', url: '/api/admin/games?status=invalidated' })
    expect(res.statusCode).toBe(200)
    expect(res.json().games[0].invalidated).toEqual({
      at: '2026-10-02T10:00:00.000Z',
      by: { id: 'm1', name: 'Mo' },
      reason: 'Board was misreading',
    })
    expect(vi.mocked(adminGames.listAllGames).mock.calls[0]?.[1]).toMatchObject({ status: 'invalidated' })
  })

  it('returns a finished game with every seat account id, to someone who did not play', async () => {
    vi.mocked(history.getFinishedGame).mockResolvedValue(finished())
    const res = await makeApp().inject({ method: 'GET', url: '/api/admin/games/g1' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.game.mySeat).toBeNull()
    expect(body.game.players.map((p: any) => p.userId)).toEqual(['u1', 'u2'])
    expect(body.detail.mode).toBe('x01')
    expect(body.invalidated).toBeNull()
  })

  it('says how an invalidated game was invalidated on its details', async () => {
    vi.mocked(history.getFinishedGame).mockResolvedValue(finished())
    vi.mocked(adminGames.getInvalidation).mockResolvedValue({ at: new Date('2026-10-02T10:00:00Z'), by: null, reason: null })
    const res = await makeApp().inject({ method: 'GET', url: '/api/admin/games/g1' })
    expect(res.json().invalidated).toEqual({ at: '2026-10-02T10:00:00.000Z', by: null, reason: null })
  })

  it('404s a game with no result (unknown, aborted or active)', async () => {
    vi.mocked(history.getFinishedGame).mockResolvedValue(undefined)
    expect((await makeApp().inject({ method: 'GET', url: '/api/admin/games/g1' })).statusCode).toBe(404)
  })

  describe('POST /api/admin/games/:id/invalidate', () => {
    const invalidate = (payload: unknown) =>
      makeApp().inject({ method: 'POST', url: '/api/admin/games/g1/invalidate', payload: payload as object })

    it('invalidates as the signed-in user and says which modes were recalculated', async () => {
      vi.mocked(adminGames.invalidateGame).mockResolvedValue({ recalculated: ['1v1'] })
      const res = await invalidate({ reason: '  Wrong board  ' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ recalculated: ['1v1'] })
      expect(adminGames.invalidateGame).toHaveBeenCalledWith(expect.anything(), 'g1', 'admin-1', 'Wrong board')
    })

    it('takes no reason, or a blank one, as none', async () => {
      vi.mocked(adminGames.invalidateGame).mockResolvedValue({ recalculated: [] })
      await invalidate({})
      await invalidate({ reason: '   ' })
      expect(vi.mocked(adminGames.invalidateGame).mock.calls.map(c => c[3])).toEqual([null, null])
    })

    it('400s a reason past 500 characters', async () => {
      expect((await invalidate({ reason: 'x'.repeat(501) })).statusCode).toBe(400)
      expect(adminGames.invalidateGame).not.toHaveBeenCalled()
    })

    it('404s an unknown game and 409s one that is not finished or already invalidated', async () => {
      vi.mocked(adminGames.invalidateGame).mockResolvedValueOnce('not-found')
      expect((await invalidate({})).statusCode).toBe(404)
      vi.mocked(adminGames.invalidateGame).mockResolvedValueOnce('not-finished')
      expect((await invalidate({})).statusCode).toBe(409)
      vi.mocked(adminGames.invalidateGame).mockResolvedValueOnce('already-invalidated')
      expect((await invalidate({})).statusCode).toBe(409)
    })
  })

  describe('POST /api/admin/games/:id/restore', () => {
    const restore = () => makeApp().inject({ method: 'POST', url: '/api/admin/games/g1/restore' })

    it('restores as the signed-in user and says which modes were recalculated', async () => {
      vi.mocked(adminGames.restoreGame).mockResolvedValue({ recalculated: ['1v1'] })
      const res = await restore()
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ recalculated: ['1v1'] })
      expect(adminGames.restoreGame).toHaveBeenCalledWith(expect.anything(), 'g1', 'admin-1')
    })

    it('404s an unknown game and 409s one that is not invalidated', async () => {
      vi.mocked(adminGames.restoreGame).mockResolvedValueOnce('not-found')
      expect((await restore()).statusCode).toBe(404)
      vi.mocked(adminGames.restoreGame).mockResolvedValueOnce('not-invalidated')
      expect((await restore()).statusCode).toBe(409)
    })
  })

  describe('DELETE /api/admin/games/:id (admins only)', () => {
    const del = () => makeApp().inject({ method: 'DELETE', url: '/api/admin/games/g1' })

    it('deletes as the signed-in admin and says which modes were recalculated', async () => {
      vi.mocked(adminGames.deleteGame).mockResolvedValue({ recalculated: ['1v1'] })
      const res = await del()
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ recalculated: ['1v1'] })
      expect(adminGames.deleteGame).toHaveBeenCalledWith(expect.anything(), 'g1', 'admin-1')
    })

    it('403s a moderator, who may invalidate but not delete', async () => {
      vi.mocked(admin.requireAdmin).mockImplementationOnce((_req: any, reply: any) => reply.code(403).send({ error: 'forbidden' }))
      expect((await del()).statusCode).toBe(403)
      expect(adminGames.deleteGame).not.toHaveBeenCalled()
      // ...while the moderator guard on the other routes still lets them in
      vi.mocked(adminGames.invalidateGame).mockResolvedValue({ recalculated: [] })
      expect((await makeApp().inject({ method: 'POST', url: '/api/admin/games/g1/invalidate', payload: {} })).statusCode).toBe(200)
    })

    it('404s an unknown game and 409s one in progress', async () => {
      vi.mocked(adminGames.deleteGame).mockResolvedValueOnce('not-found')
      expect((await del()).statusCode).toBe(404)
      vi.mocked(adminGames.deleteGame).mockResolvedValueOnce('active')
      expect((await del()).statusCode).toBe(409)
    })
  })
})
