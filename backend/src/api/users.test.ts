import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { usersApiPlugin } from './users.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'user-1'
    done()
  }),
}))
vi.mock('../db/queries.js', () => ({
  searchUsers: vi.fn().mockResolvedValue([{ id: 'user-2', name: 'Lena' }]),
  getProfileUser: vi.fn(),
}))
vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))
vi.mock('../users/account.js', () => ({ checkName: vi.fn() }))
vi.mock('../db/friends.js', () => ({ friendshipBetween: vi.fn() }))
vi.mock('../db/history.js', () => ({ getStatRows: vi.fn(), headToHead: vi.fn(), listFinishedGames: vi.fn() }))
vi.mock('../db/ranked.js', () => ({ getRankedProfile: vi.fn() }))
vi.mock('./games.js', () => ({
  toSummary: vi.fn((g: any) => ({
    id: g.id,
    mode: 'x01',
    config: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:00.000Z',
    board: null,
    mySeat: null,
    players: [],
  })),
}))

import * as queries from '../db/queries.js'
import { getAuthUser } from '../auth/session.js'
import { checkName } from '../users/account.js'
import { friendshipBetween } from '../db/friends.js'
import { getStatRows, headToHead, listFinishedGames } from '../db/history.js'
import { getRankedProfile } from '../db/ranked.js'

describe('GET /api/users', () => {
  it('finds other accounts, the signed-in user excluded', async () => {
    const app = createFastify()
    app.register(usersApiPlugin, { db: {} as any, friends: {} as any })
    const res = await app.inject({ method: 'GET', url: '/api/users?q=le' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ users: [{ id: 'user-2', name: 'Lena' }] })
    expect(queries.searchUsers).toHaveBeenCalledWith({}, 'le', 'user-1')
  })

  it('needs a query', async () => {
    const app = createFastify()
    app.register(usersApiPlugin, { db: {} as any, friends: {} as any })
    expect((await app.inject({ method: 'GET', url: '/api/users' })).statusCode).toBe(400)
  })
})

describe('GET /api/users/:id/profile', () => {
  const nowFixed = new Date('2026-10-21T12:00:00Z')
  const online = { isOnline: vi.fn(() => true) }
  const app = () => {
    const a = createFastify()
    a.register(usersApiPlugin, { db: {} as any, friends: online as any, now: () => nowFixed })
    return a
  }

  beforeEach(() => {
    online.isOnline.mockReset().mockReturnValue(true)
    vi.mocked(getStatRows).mockReset().mockResolvedValue([])
    vi.mocked(listFinishedGames).mockReset().mockResolvedValue({ games: [], next: null })
    vi.mocked(getRankedProfile).mockReset().mockResolvedValue({ ratings: [], onlineAverage: null, recent: [] })
    vi.mocked(headToHead).mockReset().mockResolvedValue({ wins: 2, losses: 1 })
  })

  it('404s for an unknown user', async () => {
    vi.mocked(queries.getProfileUser).mockResolvedValue(undefined)
    const res = await app().inject({ method: 'GET', url: '/api/users/ghost/profile' })
    expect(res.statusCode).toBe(404)
  })

  it('shows your own profile in full, with no head-to-head', async () => {
    vi.mocked(queries.getProfileUser).mockResolvedValue({
      id: 'user-1',
      name: 'Chris',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      invisible: false,
    })
    const res = await app().inject({ method: 'GET', url: '/api/users/user-1/profile' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.isSelf).toBe(true)
    expect(body.relation).toEqual({ kind: 'self', requestId: null })
    expect(body.online).toBe(true)
    expect(body.ranked).toEqual({ ratings: [], onlineAverage: null, recent: [] })
    expect(body.stats).not.toBeNull()
    expect(body.recentMatches).toEqual([])
    expect(body.playsMost).toEqual([])
    expect(body.headToHead).toBeNull()
    expect(headToHead).not.toHaveBeenCalled()
    expect(getStatRows).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.any(Date))
  })

  it("shows a friend's stats and your head-to-head record against them", async () => {
    vi.mocked(queries.getProfileUser).mockResolvedValue({
      id: 'user-2',
      name: 'Lena',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      invisible: false,
    })
    vi.mocked(friendshipBetween).mockResolvedValue({
      id: 'f1',
      requester_id: 'user-2',
      addressee_id: 'user-1',
      status: 'accepted',
    } as any)
    vi.mocked(getStatRows).mockResolvedValue([{ mode: 'x01', finishedAt: nowFixed, placement: 1, seats: 2, stats: { average: 55 } }])
    vi.mocked(listFinishedGames).mockResolvedValue({ games: [{ id: 'g1' } as any], next: null })
    const res = await app().inject({ method: 'GET', url: '/api/users/user-2/profile' })
    const body = JSON.parse(res.body)
    expect(body.isSelf).toBe(false)
    expect(body.relation).toEqual({ kind: 'friend', requestId: null })
    expect(body.online).toBe(true)
    expect(body.playsMost).toEqual([{ mode: 'x01', pct: 100 }])
    expect(body.recentMatches).toEqual([
      {
        id: 'g1',
        mode: 'x01',
        config: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:00.000Z',
        board: null,
        mySeat: null,
        players: [],
      },
    ])
    expect(body.headToHead).toEqual({ wins: 2, losses: 1 })
    expect(headToHead).toHaveBeenCalledWith(expect.anything(), 'user-1', 'user-2')
  })

  it('hides stats and online status from a stranger, but still shows your head-to-head', async () => {
    vi.mocked(queries.getProfileUser).mockResolvedValue({
      id: 'user-3',
      name: 'Anna',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      invisible: false,
    })
    vi.mocked(friendshipBetween).mockResolvedValue(undefined)
    const res = await app().inject({ method: 'GET', url: '/api/users/user-3/profile' })
    const body = JSON.parse(res.body)
    expect(body.relation).toEqual({ kind: 'none', requestId: null })
    expect(body.online).toBeNull()
    expect(body.ranked).toBeNull()
    expect(body.stats).toBeNull()
    expect(body.recentMatches).toBeNull()
    expect(body.playsMost).toBeNull()
    expect(body.headToHead).toEqual({ wins: 2, losses: 1 })
    expect(getStatRows).not.toHaveBeenCalled()
  })

  it('reports an outgoing request, keyed by its id', async () => {
    vi.mocked(queries.getProfileUser).mockResolvedValue({
      id: 'user-4',
      name: 'Marco',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      invisible: false,
    })
    vi.mocked(friendshipBetween).mockResolvedValue({
      id: 'f2',
      requester_id: 'user-1',
      addressee_id: 'user-4',
      status: 'pending',
    } as any)
    const res = await app().inject({ method: 'GET', url: '/api/users/user-4/profile' })
    expect(JSON.parse(res.body).relation).toEqual({ kind: 'outgoing', requestId: 'f2' })
  })
})

describe('GET /api/users/name-available', () => {
  it('answers signed out (sign-up), and counts your own name as free when signed in', async () => {
    vi.mocked(checkName).mockResolvedValue({ ok: false, reason: 'taken' })
    const app = createFastify()
    app.register(usersApiPlugin, { db: {} as any, friends: {} as any })
    const res = await app.inject({ method: 'GET', url: '/api/users/name-available?name=Luke' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ available: false, reason: 'taken' })
    expect(checkName).toHaveBeenLastCalledWith({}, 'Luke', null)
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'luke' })
    vi.mocked(checkName).mockResolvedValue({ ok: true, name: 'Luke' })
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/users/name-available?name=Luke' })).body)).toEqual({ available: true })
    expect(checkName).toHaveBeenLastCalledWith({}, 'Luke', 'luke')
  })
})
