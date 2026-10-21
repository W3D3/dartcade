import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { progressApiPlugin } from './progress.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'chris'
    done()
  }),
}))
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn(), loadFlagUser: vi.fn() }))
vi.mock('../db/progression.js', () => ({
  getProgress: vi.fn(),
  gameLines: vi.fn(),
  getStreak: vi.fn(),
  streakDays: vi.fn(),
  userTimeZone: vi.fn(),
}))

import { flagEnabled } from '../flags/index.js'
import { gameLines, getProgress, getStreak, streakDays, userTimeZone } from '../db/progression.js'

const app = () => {
  const a = createFastify()
  a.register(progressApiPlugin, { db: {} as any })
  return a
}

beforeEach(() => {
  vi.mocked(flagEnabled).mockReset().mockResolvedValue(true)
  vi.mocked(getProgress).mockReset().mockResolvedValue({ xp: 6780 })
  vi.mocked(gameLines).mockReset().mockResolvedValue([])
  vi.mocked(userTimeZone).mockReset().mockResolvedValue('Europe/Vienna')
  vi.mocked(getStreak).mockReset().mockResolvedValue({ current: 0, best: 0, lastDate: null, freezes: 1 })
  vi.mocked(streakDays).mockReset().mockResolvedValue({ played: [], frozen: [] })
})

describe('/api/progress', () => {
  it('shows your XP, level and day streak', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/progress/me' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ xp: 6780, level: 14, streak: { current: 0, freezes: 1, bonus: 100, playedToday: false } })
  })

  it('is not there while progression is off for you', async () => {
    vi.mocked(flagEnabled).mockResolvedValue(false)
    expect((await app().inject({ method: 'GET', url: '/api/progress/me' })).statusCode).toBe(404)
  })

  it('lists what a game paid, leaving out empty lines', async () => {
    vi.mocked(gameLines).mockResolvedValue([
      { kind: 'dart', sourceType: 'game', amount: 42, meta: { darts: 42 } },
      { kind: 'game', sourceType: 'game', amount: 0, meta: { manual: true } },
      { kind: 'highlight', sourceType: 'game:180', amount: 25, meta: { count: 1 } },
    ])
    const res = await app().inject({ method: 'GET', url: '/api/progress/games/g1' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      lines: [
        { kind: 'dart', amount: 42, count: 42 },
        { kind: 'oneEighty', amount: 25, count: 1 },
      ],
      total: 67,
      xp: 6780,
    })
    expect(vi.mocked(gameLines)).toHaveBeenCalledWith(expect.anything(), 'chris', 'g1')
  })

  it('is 404 for a game that paid nothing (yet)', async () => {
    expect((await app().inject({ method: 'GET', url: '/api/progress/games/g1' })).statusCode).toBe(404)
  })
})
