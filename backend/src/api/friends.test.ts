import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { friendsApiPlugin } from './friends.js'
import { FriendError } from '../friends/errors.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => { req.userId = 'chris'; done() }),
}))

const empty = { friends: [], incoming: [], outgoing: [] }
function makeApp() {
  const friends = {
    list: vi.fn().mockResolvedValue(empty), request: vi.fn().mockResolvedValue({ id: 'f1', status: 'pending' }),
    accept: vi.fn().mockResolvedValue(undefined), decline: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined),
  }
  const app = createFastify()
  app.register(friendsApiPlugin, { friends: friends as any })
  return { app, friends }
}
beforeEach(() => vi.clearAllMocks())

describe('friends API', () => {
  it('lists', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/friends' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(empty)
  })

  it('answers a new request 201 and a crossing one 200', async () => {
    const { app, friends } = makeApp()
    expect((await app.inject({ method: 'POST', url: '/api/friends/requests', payload: { name: 'Lena' } })).statusCode).toBe(201)
    expect(friends.request).toHaveBeenCalledWith('chris', 'Lena')
    friends.request.mockResolvedValueOnce({ id: 'f1', status: 'accepted' })
    const res = await app.inject({ method: 'POST', url: '/api/friends/requests', payload: { name: 'Lena' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ id: 'f1', status: 'accepted' })
  })

  it('passes refusals on with their code', async () => {
    const { app, friends } = makeApp()
    friends.request.mockRejectedValueOnce(FriendError.conflict('Request already sent', 'already_requested'))
    const res = await app.inject({ method: 'POST', url: '/api/friends/requests', payload: { name: 'Lena' } })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: 'Request already sent', code: 'already_requested' })
  })

  it('accepts, declines, cancels and removes', async () => {
    const { app, friends } = makeApp()
    expect((await app.inject({ method: 'POST', url: '/api/friends/requests/f1/accept' })).statusCode).toBe(204)
    expect((await app.inject({ method: 'POST', url: '/api/friends/requests/f1/decline' })).statusCode).toBe(204)
    expect((await app.inject({ method: 'DELETE', url: '/api/friends/requests/f1' })).statusCode).toBe(204)
    expect((await app.inject({ method: 'DELETE', url: '/api/friends/lena' })).statusCode).toBe(204)
    expect(friends.accept).toHaveBeenCalledWith('chris', 'f1')
    expect(friends.decline).toHaveBeenCalledWith('chris', 'f1')
    expect(friends.cancel).toHaveBeenCalledWith('chris', 'f1')
    expect(friends.remove).toHaveBeenCalledWith('chris', 'lena')
  })
})
