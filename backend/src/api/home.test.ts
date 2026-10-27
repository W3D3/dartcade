import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { homeApiPlugin } from './home.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'ann'
    done()
  }),
}))
vi.mock('../db/homeLobbies.js', () => ({ homeLobbies: vi.fn() }))
vi.mock('../db/activity.js', () => ({ listFriendActivity: vi.fn() }))

import { homeLobbies } from '../db/homeLobbies.js'
import { listFriendActivity } from '../db/activity.js'

const app = () => {
  const a = createFastify()
  a.register(homeApiPlugin, { db: {} as any })
  return a
}

beforeEach(() => {
  vi.mocked(homeLobbies).mockReset().mockResolvedValue([])
  vi.mocked(listFriendActivity).mockReset().mockResolvedValue([])
})

describe('/api/home/lobbies', () => {
  it('returns the viewer’s friends’ lobbies', async () => {
    const lobby = { id: 'l1', name: 'Mara’s lobby', hostName: 'Mara', state: 'open', mode: 'x01', startScore: 501, people: 3, boards: 2 }
    vi.mocked(homeLobbies).mockResolvedValue([{ ...lobby, state: 'open' }])
    const res = await app().inject({ method: 'GET', url: '/api/home/lobbies' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ lobbies: [lobby] })
    expect(vi.mocked(homeLobbies)).toHaveBeenCalledWith(expect.anything(), 'ann')
  })

  it('is an empty list, not an error, without friends', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/home/lobbies' })
    expect(JSON.parse(res.body)).toEqual({ lobbies: [] })
  })
})

describe('/api/home/activity', () => {
  it('returns the events with ISO times', async () => {
    vi.mocked(listFriendActivity).mockResolvedValue([
      {
        id: '7',
        userId: 'lena',
        name: 'Lena',
        avatar: { kind: 'none' },
        kind: 'ton_out',
        payload: { count: 1, best: 129 },
        createdAt: new Date('2026-10-27T20:00:00Z'),
      },
    ])
    const res = await app().inject({ method: 'GET', url: '/api/home/activity' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      events: [
        {
          id: '7',
          userId: 'lena',
          name: 'Lena',
          avatar: { kind: 'none' },
          kind: 'ton_out',
          payload: { count: 1, best: 129 },
          at: '2026-10-27T20:00:00.000Z',
        },
      ],
    })
    expect(vi.mocked(listFriendActivity)).toHaveBeenCalledWith(expect.anything(), 'ann')
  })

  it('is an empty list without friends', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/home/activity' })
    expect(JSON.parse(res.body)).toEqual({ events: [] })
  })
})
