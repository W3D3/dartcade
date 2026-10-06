import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { gamesApiPlugin } from './games.js'
import type { HistoryGame } from '../db/history.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'user-1'
    done()
  }),
}))
vi.mock('../db/history.js', () => ({
  listFinishedGames: vi.fn(),
  getStatRows: vi.fn().mockResolvedValue([]),
  getViewableGame: vi.fn(),
}))
vi.mock('../db/queries.js', () => ({ getSessionEvents: vi.fn().mockResolvedValue([]) }))

import * as history from '../db/history.js'
import * as queries from '../db/queries.js'

const game = (o: Partial<HistoryGame> = {}): HistoryGame => ({
  id: 'g1',
  game_id: 'x01',
  config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3, bullOff: 'off', bullValue: '25_50', maxRounds: 50 },
  rng_seed: 0,
  created_at: new Date('2026-10-01T09:00:00Z'),
  finished_at: new Date('2026-10-01T09:30:00Z'),
  board: { id: 'b1', name: 'Living room' },
  mySeat: 0,
  seats: [
    {
      seat: 0,
      name: 'Christoph',
      user_id: 'user-1',
      placement: 1,
      throw_position: 1,
      stats: { average: 83.9, legsWon: 3 },
      forfeited: false,
    },
    { seat: 1, name: 'Guest', user_id: null, placement: 2, throw_position: 0, stats: { average: 71.6, legsWon: 1 }, forfeited: false },
  ],
  ...o,
})

function makeApp() {
  const app = createFastify()
  app.register(gamesApiPlugin, { db: {} as any })
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/gamemodes', () => {
  it('lists the game modes', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/gamemodes' })
    expect(res.statusCode).toBe(200)
    expect(res.json().modes.map((m: any) => ({ id: m.id, teams: m.teams, supportsBots: m.supportsBots }))).toEqual([
      { id: 'atc', teams: false, supportsBots: false },
      { id: 'x01', teams: true, supportsBots: true },
    ])
  })
})

describe('GET /api/games', () => {
  it('returns a page of summaries and the next cursor', async () => {
    vi.mocked(history.listFinishedGames).mockResolvedValue({
      games: [game()],
      next: { finishedAt: new Date('2026-10-01T09:30:00Z'), id: 'g1' },
    })
    const res = await makeApp().inject({ method: 'GET', url: '/api/games?mode=x01&limit=10' })
    expect(res.statusCode).toBe(200)
    expect(history.listFinishedGames).toHaveBeenCalledWith(expect.anything(), 'user-1', { mode: 'x01', limit: 10, after: null })
    const body = res.json()
    expect(body.games[0]).toMatchObject({
      id: 'g1',
      mode: 'x01',
      mySeat: 0,
      board: { name: 'Living room' },
      finishedAt: '2026-10-01T09:30:00.000Z',
    })
    expect(body.games[0].players[1]).toEqual({
      seat: 1,
      name: 'Guest',
      userId: null,
      placement: 2,
      throwPosition: 0,
      stats: { average: 71.6, legsWon: 1 },
      forfeited: false,
    })
    expect(typeof body.nextCursor).toBe('string')
  })

  it('passes the cursor back in and defaults the limit', async () => {
    vi.mocked(history.listFinishedGames).mockResolvedValue({ games: [], next: null })
    const first = { games: [game()], next: { finishedAt: new Date('2026-10-01T09:30:00Z'), id: 'g1' } }
    vi.mocked(history.listFinishedGames).mockResolvedValueOnce(first)
    const app = makeApp()
    const cursor = (await app.inject({ method: 'GET', url: '/api/games' })).json().nextCursor
    const res = await app.inject({ method: 'GET', url: `/api/games?cursor=${cursor}` })
    expect(res.json()).toEqual({ games: [], nextCursor: null })
    expect(vi.mocked(history.listFinishedGames).mock.calls[1][2]).toEqual({ mode: undefined, limit: 25, after: first.next })
  })

  it('400 for a cursor it did not issue', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/games?cursor=bogus' })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/games/stats', () => {
  it('aggregates the last 30 days by default', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/games/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ days: 30, matches: 0, wins: 0, contested: 0, modes: {} })
    const since = vi.mocked(history.getStatRows).mock.calls[0][2]
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(60 * 86_400_000 - 1000)
  })
})

describe('GET /api/games/:id', () => {
  it('404 when the game is not viewable', async () => {
    vi.mocked(history.getViewableGame).mockResolvedValue(undefined)
    expect((await makeApp().inject({ method: 'GET', url: '/api/games/g1' })).statusCode).toBe(404)
  })

  it('returns the game and its detail', async () => {
    vi.mocked(history.getViewableGame).mockResolvedValue(game())
    const res = await makeApp().inject({ method: 'GET', url: '/api/games/g1' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ game: { id: 'g1', mySeat: 0 }, detail: { mode: 'x01', legs: [] } })
    expect(queries.getSessionEvents).toHaveBeenCalledWith(expect.anything(), 'g1')
  })

  it('hides account ids from someone without a seat', async () => {
    vi.mocked(history.getViewableGame).mockResolvedValue(game({ mySeat: null }))
    const body = (await makeApp().inject({ method: 'GET', url: '/api/games/g1' })).json()
    expect(body.game.mySeat).toBeNull()
    expect(body.game.players.map((p: any) => p.userId)).toEqual([null, null])
  })
})
