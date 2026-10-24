import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { matchmakingApiPlugin } from './matchmaking.js'
import { MatchmakingError } from '../matchmaking/service.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'chris'
    done()
  }),
}))
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn(), loadFlagUser: vi.fn().mockResolvedValue(null) }))

import { flagEnabled } from '../flags/index.js'

const matchmaking = { search: vi.fn(), cancel: vi.fn(), accept: vi.fn(), decline: vi.fn() }
const app = () => {
  const a = createFastify()
  a.register(matchmakingApiPlugin, { db: {} as any, matchmaking: matchmaking as any })
  return a
}

beforeEach(() => {
  vi.mocked(flagEnabled).mockReset().mockResolvedValue(true)
  for (const fn of Object.values(matchmaking)) fn.mockReset().mockResolvedValue(undefined)
})

describe('/api/matchmaking', () => {
  it('starts, cancels, accepts and declines for the signed-in user', async () => {
    const a = app()
    expect((await a.inject({ method: 'POST', url: '/api/matchmaking/search', payload: { mode: '1v1', firstTo: 3 } })).statusCode).toBe(204)
    expect(matchmaking.search).toHaveBeenCalledWith('chris', { mode: '1v1', firstTo: 3 })
    expect((await a.inject({ method: 'DELETE', url: '/api/matchmaking/search' })).statusCode).toBe(204)
    expect(matchmaking.cancel).toHaveBeenCalledWith('chris')
    expect((await a.inject({ method: 'POST', url: '/api/matchmaking/matches/m1/accept' })).statusCode).toBe(204)
    expect(matchmaking.accept).toHaveBeenCalledWith('chris', 'm1')
    expect((await a.inject({ method: 'POST', url: '/api/matchmaking/matches/m1/decline' })).statusCode).toBe(204)
    expect(matchmaking.decline).toHaveBeenCalledWith('chris', 'm1')
  })

  it('refuses a search while matchmaking is off for the user', async () => {
    vi.mocked(flagEnabled).mockResolvedValue(false)
    const res = await app().inject({ method: 'POST', url: '/api/matchmaking/search', payload: { mode: '1v1', firstTo: 2 } })
    expect(res.statusCode).toBe(403)
    expect(matchmaking.search).not.toHaveBeenCalled()
  })

  it("answers with the queue's conflict", async () => {
    matchmaking.search.mockRejectedValue(MatchmakingError.conflict('paused', 'paused'))
    const res = await app().inject({ method: 'POST', url: '/api/matchmaking/search', payload: { mode: '1v1', firstTo: 2 } })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: 'paused', code: 'paused' })
  })

  it('takes First to 2 or 3 only', async () => {
    const res = await app().inject({ method: 'POST', url: '/api/matchmaking/search', payload: { mode: '1v1', firstTo: 5 } })
    expect(res.statusCode).toBe(400)
  })
})
