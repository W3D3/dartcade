import { describe, it, expect, vi } from 'vitest'
import { createFastify } from './fastify.js'
import { usersApiPlugin } from './users.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => { req.userId = 'user-1'; done() }),
}))
vi.mock('../db/queries.js', () => ({
  searchUsers: vi.fn().mockResolvedValue([{ id: 'user-2', name: 'Lena' }]),
}))

import * as queries from '../db/queries.js'

describe('GET /api/users', () => {
  it('finds other accounts, the signed-in user excluded', async () => {
    const app = createFastify()
    app.register(usersApiPlugin, { db: {} as any })
    const res = await app.inject({ method: 'GET', url: '/api/users?q=le' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ users: [{ id: 'user-2', name: 'Lena' }] })
    expect(queries.searchUsers).toHaveBeenCalledWith({}, 'le', 'user-1')
  })

  it('needs a query', async () => {
    const app = createFastify()
    app.register(usersApiPlugin, { db: {} as any })
    expect((await app.inject({ method: 'GET', url: '/api/users' })).statusCode).toBe(400)
  })
})
