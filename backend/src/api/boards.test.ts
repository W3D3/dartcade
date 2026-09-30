import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFastify } from './fastify.js'
import { boardsApiPlugin } from './boards.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn(async (req: any, _reply: any) => { req.userId = 'user-1' }),
}))
vi.mock('../bridge-gw/connections.js', () => ({
  bridgeConnections: {
    isOnline: vi.fn().mockReturnValue(false),
    get: vi.fn().mockReturnValue(undefined),
    recentEvents: vi.fn().mockReturnValue([]),
  },
}))
vi.mock('../db/queries.js', () => ({
  getBoardsByOwner: vi.fn().mockResolvedValue([]),
  insertBoard: vi.fn().mockResolvedValue(undefined),
  getBoardById: vi.fn().mockResolvedValue(undefined),
  deleteBoard: vi.fn().mockResolvedValue(undefined),
  renameBoard: vi.fn().mockResolvedValue(undefined),
}))

import * as queries from '../db/queries.js'
import * as connections from '../bridge-gw/connections.js'
import * as middleware from '../auth/middleware.js'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

function makeApp() {
  const app = createFastify()
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

describe('GET /api/boards - bridgeVersion', () => {
  it('reports bridge and Board Manager versions separately', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
      { id: 'board-1', name: 'Board', hardware_id: null, created_at: new Date() as any, owner_user_id: 'user-1', token_hash: 'hash' },
    ])
    vi.mocked(connections.bridgeConnections.isOnline).mockReturnValue(true)
    vi.mocked(connections.bridgeConnections.get).mockReturnValue({ bridgeVersion: 'v0.4.2', bmVersion: '1.0.7', bmUrl: 'http://192.168.0.109:3180' } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    expect(res.statusCode).toBe(200)
    const board = JSON.parse(res.body).boards[0]
    expect(board.bridgeVersion).toBe('v0.4.2')
    expect(board.bmVersion).toBe('1.0.7')
  })

  it('keeps the Board Manager port in bmUrl', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
      { id: 'board-1', name: 'Board', hardware_id: null, created_at: new Date() as any, owner_user_id: 'user-1', token_hash: 'hash' },
    ])
    vi.mocked(connections.bridgeConnections.get).mockReturnValue({ bmVersion: '1.0.7', bmUrl: 'http://192.168.0.109:3180' } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    const board = JSON.parse(res.body).boards[0]
    expect(board.ip).toBe('192.168.0.109')
    expect(board.bmUrl).toBe('http://192.168.0.109:3180')
  })

  it('bridgeVersion is null when board is offline', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
      { id: 'board-1', name: 'Board', hardware_id: null, created_at: new Date() as any, owner_user_id: 'user-1', token_hash: 'hash' },
    ])
    vi.mocked(connections.bridgeConnections.get).mockReturnValue(undefined)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    expect(JSON.parse(res.body).boards[0].bridgeVersion).toBeNull()
  })
})

describe('GET /api/boards/:id/camera/:index', () => {
  it('returns 404 when board not found', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(undefined)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/nope/camera/0' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when board owned by another user', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'other' } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/b1/camera/0' })
    expect(res.statusCode).toBe(403)
  })

  it('returns 503 when board is offline', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'user-1' } as any)
    vi.mocked(connections.bridgeConnections.get).mockReturnValue(undefined)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/b1/camera/0' })
    expect(res.statusCode).toBe(503)
  })

  it('returns 503 when board has no bmUrl', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'user-1' } as any)
    vi.mocked(connections.bridgeConnections.get).mockReturnValue({ bmUrl: null } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/b1/camera/0' })
    expect(res.statusCode).toBe(503)
  })

  it('proxies JPEG from board manager at correct URL', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'user-1' } as any)
    vi.mocked(connections.bridgeConnections.get).mockReturnValue({ bmUrl: 'http://192.168.0.109:3180' } as any)
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: () => Promise.resolve(fakeJpeg.buffer),
    }))
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/b1/camera/1' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/jpeg')
    expect(vi.mocked(global.fetch as any)).toHaveBeenCalledWith('http://192.168.0.109:3180/api/img/cams/1')
  })
})

describe('PATCH /api/boards/:id', () => {
  const row = { id: 'board-1', name: 'Board', hardware_id: null, created_at: new Date() as any, owner_user_id: 'user-1', token_hash: 'hash' }

  it('renames an owned board', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(row)
    const app = makeApp()
    const res = await app.inject({ method: 'PATCH', url: '/api/boards/board-1', payload: { name: '  Garage ' } })
    expect(res.statusCode).toBe(200)
    expect(queries.renameBoard).toHaveBeenCalledWith(expect.anything(), 'board-1', 'Garage')
  })

  it('rejects an empty name', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'PATCH', url: '/api/boards/board-1', payload: { name: ' ' } })
    expect(res.statusCode).toBe(400)
  })

  it('returns 403 for another user\'s board', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ ...row, owner_user_id: 'user-2' })
    const app = makeApp()
    const res = await app.inject({ method: 'PATCH', url: '/api/boards/board-1', payload: { name: 'X' } })
    expect(res.statusCode).toBe(403)
    expect(queries.renameBoard).not.toHaveBeenCalled()
  })
})

describe('GET /api/boards/:id/events', () => {
  const row = { id: 'board-1', name: 'Board', hardware_id: null, created_at: new Date() as any, owner_user_id: 'user-1', token_hash: 'hash' }

  it('returns the recent event feed', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(row)
    const ev = { at: '2026-09-29T19:14:08Z', kind: 'takeout.started', data: {} }
    vi.mocked(connections.bridgeConnections.recentEvents).mockReturnValue([ev])
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/events' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).events).toEqual([ev])
  })

  it('returns 403 for another user\'s board', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ ...row, owner_user_id: 'user-2' })
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/events' })
    expect(res.statusCode).toBe(403)
  })
})

describe('boards: spec enforcement', () => {
  const board = { id: 'board-1', name: 'Board', hardware_id: null, created_at: new Date('2026-08-12T10:00:00Z') as any, owner_user_id: 'user-1', token_hash: 'hash' }

  it('checks auth before the body: signed-out + invalid body is 401, not 400', async () => {
    vi.mocked(middleware.requireAuth).mockImplementationOnce(async (_req: any, reply: any) => {
      reply.code(401).send({ error: 'unauthorized' })
    })
    const res = await makeApp().inject({ method: 'POST', url: '/api/boards', payload: { bogus: true } })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a whitespace-only name on rename with 400', async () => {
    const res = await makeApp().inject({ method: 'PATCH', url: '/api/boards/board-1', payload: { name: '  ' } })
    expect(res.statusCode).toBe(400)
  })

  it('serves camera frames with a cache-busting query', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board)
    vi.mocked(connections.bridgeConnections.get).mockReturnValue({ bmUrl: 'http://bm:3180' } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8]), { status: 200, headers: { 'content-type': 'image/jpeg' } })))
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards/board-1/camera/0?t=1790700000000' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
  })

  it('rejects a non-numeric camera index with 400', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards/board-1/camera/abc' })
    expect(res.statusCode).toBe(400)
  })

  it('reports a Board Manager rejection as 502', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board)
    vi.mocked(connections.bridgeConnections.get).mockReturnValue({ bmUrl: 'http://bm:3180' } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    const res = await makeApp().inject({ method: 'POST', url: '/api/boards/board-1/reset' })
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body).error).toMatch(/Board Manager/)
  })

  it('lists boards with createdAt as an ISO timestamp', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([board])
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).boards[0].createdAt).toBe('2026-08-12T10:00:00.000Z')
  })
})
