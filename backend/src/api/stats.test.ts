import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { statsApiPlugin } from './stats.js'
import type { StatGameRow } from '../stats/x01Legs.js'
import type { X01Detail } from '../session/types.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'user-1'
    done()
  }),
}))
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn(), loadFlagUser: vi.fn() }))
vi.mock('../db/history.js', () => ({ x01StatOptions: vi.fn(), listX01StatGames: vi.fn(), countX01StatLegs: vi.fn() }))
vi.mock('../history/detail.js', () => ({ storedDetails: vi.fn() }))

import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { countX01StatLegs, listX01StatGames, x01StatOptions } from '../db/history.js'
import { storedDetails } from '../history/detail.js'

const DAY_MS = 86_400_000

const game: StatGameRow = {
  id: 'g1',
  game_id: 'x01',
  config: { startScore: 501, outMode: 'double' },
  rng_seed: 0,
  game_version: 1,
  created_at: new Date('2026-11-01T20:00:00Z'),
  finished_at: new Date('2026-11-01T20:30:00Z'),
  board: null,
  mySeat: 0,
  invalidated: false,
  kind: 'solo',
  seats: [
    {
      seat: 0,
      name: 'Christoph',
      user_id: 'user-1',
      avatar: { kind: 'none' },
      bot_level: null,
      placement: 1,
      throw_position: 0,
      stats: {},
      forfeited: false,
    },
  ],
}
const dart = (name: string, number: number, multiplier: 1 | 2 | 3) => ({
  index: 0,
  segment: { name, number, multiplier, bed: multiplier === 2 ? ('Double' as const) : ('Single' as const) },
  coords: null,
  source: 'manual' as const,
  corrected: false,
  thrownAt: '',
})
// One leg of 501: nine darts, the last on D12
const detail: X01Detail = {
  mode: 'x01',
  legs: [
    {
      leg: 0,
      starter: 0,
      winner: 0,
      visits: [
        {
          visit: 0,
          seat: 0,
          committedAt: '',
          darts: [dart('T20', 20, 3), dart('T20', 20, 3), dart('T20', 20, 3)],
          scored: 180,
          remaining: 321,
          bust: false,
        },
        {
          visit: 1,
          seat: 0,
          committedAt: '',
          darts: [dart('T20', 20, 3), dart('T20', 20, 3), dart('T20', 20, 3)],
          scored: 180,
          remaining: 141,
          bust: false,
        },
        {
          visit: 2,
          seat: 0,
          committedAt: '',
          darts: [dart('T20', 20, 3), dart('T19', 19, 3), dart('D12', 12, 2)],
          scored: 141,
          remaining: 0,
          bust: false,
        },
      ],
    },
  ],
}

function makeApp() {
  const app = createFastify()
  app.register(statsApiPlugin, { db: {} as any })
  return app
}
const get = (url: string) => makeApp().inject({ method: 'GET', url })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(flagEnabled).mockResolvedValue(true)
  vi.mocked(loadFlagUser).mockResolvedValue(null)
  vi.mocked(x01StatOptions).mockResolvedValue({ starts: [501, 301], outs: ['straight', 'double'] })
  vi.mocked(listX01StatGames).mockResolvedValue([game])
  vi.mocked(countX01StatLegs).mockResolvedValue(7)
  vi.mocked(storedDetails).mockResolvedValue([{ detail, stats: { rows: [], seats: [] } }])
})

describe('GET /api/stats/x01', () => {
  it('is not there while stats.enabled is off for the user', async () => {
    vi.mocked(flagEnabled).mockResolvedValue(false)
    const res = await get('/api/stats/x01')
    expect(res.statusCode).toBe(404)
    expect(flagEnabled).toHaveBeenCalledWith('stats.enabled', null)
    expect(listX01StatGames).not.toHaveBeenCalled()
  })

  it('picks the start score and out rule played most when they are left out', async () => {
    const res = await get('/api/stats/x01')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      applied: { range: 'legs50', start: 501, out: 'straight', kind: 'all' },
      options: { starts: [301, 501], outModes: ['straight', 'double'] },
      totalLegs: 7,
    })
    // Last 50 legs: at most 100 games
    expect(listX01StatGames).toHaveBeenCalledWith({}, 'user-1', { start: 501, out: 'straight', kind: 'all' }, { limit: 100 })
    expect(countX01StatLegs).toHaveBeenCalledWith({}, 'user-1', { start: 501, out: 'straight', kind: 'all' })
  })

  it('passes the range and filters asked for through to the query', async () => {
    const before = Date.now()
    const res = await get('/api/stats/x01?range=days30&start=301&out=double&kind=bots')
    expect(res.json().applied).toEqual({ range: 'days30', start: 301, out: 'double', kind: 'bots' })
    const [, , filter, window] = vi.mocked(listX01StatGames).mock.calls[0]
    expect(filter).toEqual({ start: 301, out: 'double', kind: 'bots' })
    // Twice the 30 days: the range and the one before it
    expect(window.since?.getTime()).toBeGreaterThanOrEqual(before - 60 * DAY_MS)
    expect(window.since?.getTime()).toBeLessThanOrEqual(Date.now() - 60 * DAY_MS)
  })

  it('reads the legs from the games’ stored details', async () => {
    const res = await get('/api/stats/x01?range=all')
    expect(storedDetails).toHaveBeenCalledWith({}, [game], expect.any(Function))
    const body = res.json()
    expect(body.window.legs).toBe(1)
    expect(body.before).toBeNull()
    expect(body.overview.bests.bestLeg).toMatchObject({ value: 9, ref: { gameId: 'g1', kind: 'solo' } })
    expect(body.scoring.count180.value).toBe(2)
  })

  it('answers with no start or out rule, and reads nothing, for a user without X01 games', async () => {
    vi.mocked(x01StatOptions).mockResolvedValue({ starts: [], outs: [] })
    const res = await get('/api/stats/x01')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      applied: { range: 'legs50', start: null, out: null, kind: 'all' },
      options: { starts: [], outModes: [] },
      totalLegs: 0,
      window: { legs: 0, from: null, to: null },
    })
    expect(listX01StatGames).not.toHaveBeenCalled()
    expect(countX01StatLegs).not.toHaveBeenCalled()
  })

  it('leaves out an out rule it does not know', async () => {
    vi.mocked(x01StatOptions).mockResolvedValue({ starts: [501], outs: ['bogus', 'double'] })
    const res = await get('/api/stats/x01')
    expect(res.json()).toMatchObject({ applied: { out: 'double' }, options: { outModes: ['double'] } })
  })

  it('rejects a range it does not know', async () => {
    expect((await get('/api/stats/x01?range=forever')).statusCode).toBe(400)
  })
})
