import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { rankedApiPlugin } from './ranked.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'chris'
    done()
  }),
}))
vi.mock('../db/ranked.js', () => ({ getRatings: vi.fn(), ratingChangeSince: vi.fn(), onlineAverage: vi.fn(), recentRanked: vi.fn() }))

import { getRatings, onlineAverage, ratingChangeSince, recentRanked } from '../db/ranked.js'

const now = new Date('2026-10-14T12:00:00Z')
const app = () => {
  const a = createFastify()
  a.register(rankedApiPlugin, { db: {} as any, now: () => now })
  return a
}

beforeEach(() => {
  vi.mocked(getRatings)
    .mockReset()
    .mockResolvedValue({
      '1v1': { mode: '1v1', rating: 1284, rankIndex: 14, matches: 40, wins: 23, streak: 3 },
      '2v2': { mode: '2v2', rating: 1200, rankIndex: null, matches: 0, wins: 0, streak: 0 },
    })
  vi.mocked(ratingChangeSince).mockReset().mockResolvedValue({ '1v1': 46, '2v2': 0 })
  vi.mocked(onlineAverage).mockReset().mockResolvedValue(58.4)
  vi.mocked(recentRanked)
    .mockReset()
    .mockResolvedValue([
      {
        sessionId: 'g1',
        mode: '1v1',
        won: true,
        change: 17,
        at: new Date('2026-10-14T20:14:00Z'),
        opponents: [{ userId: 'anna', name: 'Anna K.', rating: 1301 }],
      },
    ])
})

describe('/api/ranked/me', () => {
  it('shows both ratings (hidden while placing) with the 30-day change, the online average and recent games', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/ranked/me' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      ratings: [
        { mode: '1v1', rating: 1284, rankIndex: 14, matches: 40, wins: 23, streak: 3, change30d: 46 },
        { mode: '2v2', rating: null, rankIndex: null, matches: 0, wins: 0, streak: 0, change30d: 0 },
      ],
      onlineAverage: 58.4,
      recent: [
        {
          sessionId: 'g1',
          mode: '1v1',
          won: true,
          change: 17,
          at: '2026-10-14T20:14:00.000Z',
          opponents: [{ userId: 'anna', name: 'Anna K.', rating: 1301 }],
        },
      ],
    })
    expect(vi.mocked(getRatings)).toHaveBeenCalledWith(expect.anything(), 'chris')
    expect(vi.mocked(ratingChangeSince)).toHaveBeenCalledWith(expect.anything(), 'chris', new Date('2026-09-14T12:00:00Z'))
  })
})
