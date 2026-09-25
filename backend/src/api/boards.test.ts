import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { boardsApiPlugin } from './boards.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: async (req: any, _reply: any) => { req.userId = 'user-1' },
}))
vi.mock('../bridge-gw/connections.js', () => ({
  bridgeConnections: { isOnline: vi.fn().mockReturnValue(false) },
}))
vi.mock('../db/queries.js', () => ({
  getBoardsByOwner: vi.fn().mockResolvedValue([]),
  insertBoard: vi.fn().mockResolvedValue(undefined),
  getBoardById: vi.fn().mockResolvedValue(undefined),
  deleteBoard: vi.fn().mockResolvedValue(undefined),
}))

import * as queries from '../db/queries.js'

beforeEach(() => vi.clearAllMocks())

function makeApp() {
  const app = Fastify()
  app.register(boardsApiPlugin, { db: {} as any })
  return app
}

describe('GET /api/boards', () => {
  it('returns empty array when user has no boards', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).boards).toEqual([])
  })

  it('returns boards owned by user', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
      { id: 'board-1', name: 'Living Room', hardware_id: null, created_at: new Date() as any, owner_user_id: 'user-1', token_hash: 'hash' },
    ])
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).boards[0].id).toBe('board-1')
  })
})

describe('POST /api/boards', () => {
  it('returns 201 with id and token (never hash)', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/boards',
      payload: { name: 'Living Room' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBeDefined()
    expect(body.token).toBeDefined()
    expect(body.token).not.toContain('hash')
    expect(body).not.toHaveProperty('token_hash')
    expect(queries.insertBoard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ owner_user_id: 'user-1', name: 'Living Room' }),
    )
  })

  it('returns 400 when name is missing', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards', payload: {} })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /api/boards/:id', () => {
  it('returns 404 when board not found', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/nope' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when board owned by another user', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({
      id: 'board-1', owner_user_id: 'other-user',
    } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1' })
    expect(res.statusCode).toBe(403)
  })

  it('returns 204 on successful delete', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({
      id: 'board-1', owner_user_id: 'user-1',
    } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1' })
    expect(res.statusCode).toBe(204)
    expect(queries.deleteBoard).toHaveBeenCalledWith(expect.anything(), 'board-1')
  })

  it('returns 409 when board has active sessions (FK violation)', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({
      id: 'board-1', owner_user_id: 'user-1',
    } as any)
    const fkError = Object.assign(new Error('FK violation'), { code: '23503' })
    vi.mocked(queries.deleteBoard).mockRejectedValue(fkError)
    const app = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1' })
    expect(res.statusCode).toBe(409)
  })
})
