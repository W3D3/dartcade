import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { progressApiPlugin } from './progress.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'chris'
    done()
  }),
}))
vi.mock('../progression/challengeSets.js', () => ({ ensureSets: vi.fn(), challengesView: vi.fn(), reroll: vi.fn(), claim: vi.fn() }))
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn(), loadFlagUser: vi.fn() }))
vi.mock('../db/progression.js', () => ({
  getProgress: vi.fn(),
  gameLines: vi.fn(),
  getStreak: vi.fn(),
  streakDays: vi.fn(),
  userTimeZone: vi.fn(),
  unlockedPerks: vi.fn(),
  lockUser: vi.fn(),
}))
vi.mock('../db/users.js', () => ({ getPreferences: vi.fn(), updatePreferences: vi.fn() }))
vi.mock('../db/friends.js', () => ({ areFriends: vi.fn() }))
vi.mock('../db/ranked.js', () => ({ getRatings: vi.fn(), x01Average: vi.fn() }))
vi.mock('../db/profile.js', () => ({ profileUser: vi.fn(), modeCounts: vi.fn(), headToHead: vi.fn(), recentGames: vi.fn() }))

import { flagEnabled } from '../flags/index.js'
import { challengesView, claim, ensureSets } from '../progression/challengeSets.js'
import { gameLines, getProgress, getStreak, streakDays, unlockedPerks, userTimeZone } from '../db/progression.js'
import { DEFAULT_EQUIPPED, PERKS, levelPerks } from '../shared/progression.js'
import { getPreferences, updatePreferences } from '../db/users.js'
import { areFriends } from '../db/friends.js'
import { getRatings, x01Average } from '../db/ranked.js'
import { headToHead, modeCounts, profileUser, recentGames } from '../db/profile.js'

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
  vi.mocked(unlockedPerks)
    .mockReset()
    .mockResolvedValue([...levelPerks(1).map(p => p.id), 'title.oche-regular', 'frame.bronze'])
  vi.mocked(getPreferences)
    .mockReset()
    .mockResolvedValue({ equipped: { title: 'title.oche-regular' } })
  vi.mocked(updatePreferences).mockReset().mockResolvedValue({})
  vi.mocked(areFriends).mockReset().mockResolvedValue(false)
  const rating = { rating: 1200, rankIndex: null, matches: 0, wins: 0, streak: 0 }
  vi.mocked(getRatings)
    .mockReset()
    .mockResolvedValue({
      '1v1': { ...rating, mode: '1v1', rankIndex: 15, rating: 1310, matches: 12, wins: 8 },
      '2v2': { ...rating, mode: '2v2' },
    })
  vi.mocked(x01Average).mockReset().mockResolvedValue(61.2)
  vi.mocked(profileUser)
    .mockReset()
    .mockResolvedValue({
      id: 'anna',
      name: 'Anna',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      avatar: { kind: 'preset', preset: 'trophy', color: '#2d6cdf', fgColor: '#ffffff' },
      equipped: { colors: 'colors.ice' },
      ban: null,
    })
  vi.mocked(modeCounts)
    .mockReset()
    .mockResolvedValue([
      { mode: 'x01', games: 20 },
      { mode: 'atc', games: 3 },
    ])
  vi.mocked(headToHead).mockReset().mockResolvedValue({ wins: 1, losses: 2 })
  vi.mocked(recentGames).mockReset().mockResolvedValue([])
  const row = {
    period: 'daily' as const,
    periodKey: '2026-10-21',
    templateId: 'd.darts',
    target: 100,
    progress: 0,
    xp: 40,
    reroll: 0,
    state: {},
  }
  vi.mocked(ensureSets)
    .mockReset()
    .mockResolvedValue({
      daily: [
        { ...row, id: 'c1', slot: 1, completedAt: new Date(), claimedAt: new Date() },
        { ...row, id: 'c2', slot: 2, completedAt: new Date(), claimedAt: null },
        { ...row, id: 'c3', slot: 3, completedAt: null, claimedAt: null },
      ],
      weekly: [
        { ...row, period: 'weekly', id: 'w1', slot: 1, completedAt: new Date(), claimedAt: null },
        { ...row, period: 'weekly', id: 'w2', slot: 2, completedAt: null, claimedAt: null },
      ],
    })
})

describe('/api/progress', () => {
  it('shows your XP, level and day streak', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/progress/me' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({
      xp: 6780,
      level: 14,
      streak: { current: 0, freezes: 1, bonus: 100, playedToday: false },
      // c2 and c3 of today, and w1 to claim
      challengesOpen: 3,
    })
  })

  it('claims a finished challenge, answering with the challenges and your XP', async () => {
    const set = { resetsAt: '2026-10-22T00:00:00.000Z', items: [] }
    vi.mocked(challengesView).mockResolvedValue({ daily: set, weekly: set })
    vi.mocked(claim).mockResolvedValue('ok')
    const res = await app().inject({ method: 'POST', url: '/api/challenges/c2/claim' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ challenges: { daily: set, weekly: set }, xp: 6780, level: 14 })
    expect(claim).toHaveBeenCalledWith(expect.anything(), 'chris', 'c2', expect.any(String))
    vi.mocked(claim).mockResolvedValue('not-done')
    expect((await app().inject({ method: 'POST', url: '/api/challenges/c3/claim' })).statusCode).toBe(409)
    vi.mocked(claim).mockResolvedValue('not-found')
    expect((await app().inject({ method: 'POST', url: '/api/challenges/x/claim' })).statusCode).toBe(404)
    vi.mocked(flagEnabled).mockResolvedValue(false)
    vi.mocked(claim).mockClear()
    expect((await app().inject({ method: 'POST', url: '/api/challenges/c2/claim' })).statusCode).toBe(404)
    expect(claim).not.toHaveBeenCalled()
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

  it('shows your perks and your look, every kind at its default unless picked', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/progress/me' })
    expect(JSON.parse(res.body).perks).toEqual({
      unlocked: [...levelPerks(1).map(p => p.id), 'title.oche-regular', 'frame.bronze'],
      equipped: { ...DEFAULT_EQUIPPED, title: 'title.oche-regular' },
    })
  })

  it('equips an unlocked perk, and nothing locked or of the wrong kind', async () => {
    const put = (body: object) => app().inject({ method: 'PUT', url: '/api/progress/equip', payload: body })
    const ok = await put({ banner: 'banner.plain', colors: 'colors.dartcade' })
    expect(ok.statusCode).toBe(200)
    expect(vi.mocked(updatePreferences)).toHaveBeenCalledWith(expect.anything(), 'chris', {
      equipped: { ...DEFAULT_EQUIPPED, title: 'title.oche-regular' },
    })
    expect((await put({ title: 'title.dartcade-legend' })).statusCode).toBe(409)
    expect((await put({ title: 'banner.plain' })).statusCode).toBe(409)
  })

  it('equips the new kinds the same way: a frame you hold, not a sound pack you do not', async () => {
    const put = (body: object) => app().inject({ method: 'PUT', url: '/api/progress/equip', payload: body })
    expect((await put({ frame: 'frame.bronze' })).statusCode).toBe(200)
    expect(vi.mocked(updatePreferences)).toHaveBeenLastCalledWith(expect.anything(), 'chris', {
      equipped: { ...DEFAULT_EQUIPPED, title: 'title.oche-regular', frame: 'frame.bronze' },
    })
    expect((await put({ sound: 'sound.legend' })).statusCode).toBe(409)
    expect((await put({ celebration: 'frame.bronze' })).statusCode).toBe(409)
  })

  it("shows a stranger's profile without their streak, XP or collection", async () => {
    const res = await app().inject({ method: 'GET', url: '/api/users/anna/profile' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({
      name: 'Anna',
      relation: 'stranger',
      look: { ...DEFAULT_EQUIPPED, colors: 'colors.ice' },
      avatar: { kind: 'preset', preset: 'trophy' },
      level: 14,
      streak: null,
      xp: null,
      collection: null,
      favourite: 'x01',
      matches: 23,
      average: 61.2,
      headToHead: { wins: 1, losses: 2 },
      ranked: [
        { mode: '1v1', rankIndex: 15, rating: 1310, matches: 12, wins: 8 },
        { mode: '2v2', rankIndex: null, rating: null, matches: 0, wins: 0 },
      ],
    })
  })

  it("shows a banned player's ban: its category and end", async () => {
    const base = await vi.mocked(profileUser).getMockImplementation()?.(undefined as never, 'anna')
    if (!base) throw new Error('no profile mock')
    vi.mocked(profileUser).mockResolvedValue({ ...base, ban: { category: 'cheating', until: new Date('2026-11-01T00:00:00Z') } })
    const res = await app().inject({ method: 'GET', url: '/api/users/anna/profile' })
    expect(JSON.parse(res.body).ban).toEqual({ category: 'cheating', until: '2026-11-01T00:00:00.000Z' })
  })

  it("shows a friend's streak", async () => {
    vi.mocked(areFriends).mockResolvedValue(true)
    const res = await app().inject({ method: 'GET', url: '/api/users/anna/profile' })
    expect(JSON.parse(res.body)).toMatchObject({ relation: 'friend', streak: 0, xp: null })
  })

  it('shows your own XP and collection, and no head-to-head', async () => {
    vi.mocked(profileUser).mockResolvedValue({
      id: 'chris',
      name: 'Chris',
      createdAt: new Date(),
      avatar: { kind: 'none' },
      equipped: null,
      ban: null,
    })
    const res = await app().inject({ method: 'GET', url: '/api/users/chris/profile' })
    expect(JSON.parse(res.body)).toMatchObject({
      relation: 'self',
      xp: 6780,
      headToHead: null,
      collection: { unlocked: levelPerks(1).length + 2, total: PERKS.length },
    })
  })
})
