import { describe, it, expect, vi, beforeEach } from 'vitest'
import rateLimit from '@fastify/rate-limit'
import { createFastify } from './fastify.js'
import { sessionsApiPlugin } from './sessions.js'
import { ActiveSessionError } from '../session/engine.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => { req.userId = 'user-1'; done() }),
}))
vi.mock('../db/queries.js', () => ({
  getBoardById: vi.fn().mockResolvedValue({ id: 'b1', owner_user_id: 'user-1', name: 'Living room' }),
  getBoardsByOwner: vi.fn().mockResolvedValue([{ id: 'b1' }]),
}))

import * as queries from '../db/queries.js'
import * as middleware from '../auth/middleware.js'

function makeApp() {
  const engine = {
    create: vi.fn().mockResolvedValue({ sessionId: 'sess-1' }),
    getSession: vi.fn().mockReturnValue(undefined),
    getAllSessions: vi.fn().mockReturnValue([]),
    getSnapshot: vi.fn().mockReturnValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(true),
  } as any
  const app = createFastify()
  app.register(sessionsApiPlugin, { engine, db: {} as any })
  return { app, engine }
}

beforeEach(() => vi.clearAllMocks())

describe('GET /health', () => {
  it('returns { ok: true }', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)
  })

  it('answers a 429 over the rate limit with an ErrorResponse body', async () => {
    const engine = {
      create: vi.fn().mockResolvedValue({ sessionId: 'sess-1' }),
      getSession: vi.fn().mockReturnValue(undefined),
      getAllSessions: vi.fn().mockReturnValue([]),
      getSnapshot: vi.fn().mockReturnValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(true),
    } as any
    const app = createFastify()
    await app.register(rateLimit, { max: 1, timeWindow: '1 minute' })
    app.register(sessionsApiPlugin, { engine, db: {} as any })

    const first = await app.inject({ method: 'GET', url: '/health' })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({ method: 'GET', url: '/health' })
    expect(second.statusCode).toBe(429)
    expect(JSON.parse(second.body)).toEqual({ error: expect.any(String) })
  })
})

describe('POST /api/sessions', () => {
  it('returns 201 with sessionId on success', async () => {
    const { app } = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/sessions',
      payload: { boardId: 'b1', gameId: 'atc', config: {}, players: [{ name: 'Alice' }] },
    })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).sessionId).toBe('sess-1')
  })

  it('returns 400 for unknown game', async () => {
    const { app, engine } = makeApp()
    engine.create.mockRejectedValue(new Error('unknown game: xyz'))
    const res = await app.inject({
      method: 'POST', url: '/api/sessions',
      payload: { boardId: 'b1', gameId: 'xyz', config: {}, players: [{ name: 'Alice' }] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 409 when board already has active session', async () => {
    const { app, engine } = makeApp()
    engine.create.mockRejectedValue(new Error('active session already exists for board b1'))
    const res = await app.inject({
      method: 'POST', url: '/api/sessions',
      payload: { boardId: 'b1', gameId: 'atc', config: {}, players: [{ name: 'Alice' }] },
    })
    expect(res.statusCode).toBe(409)
  })

  it('returns 400 with the reason for an invalid config', async () => {
    const { app, engine } = makeApp()
    engine.create.mockRejectedValue(new Error('invalid config: bull off needs at least two players'))
    const res = await app.inject({
      method: 'POST', url: '/api/sessions',
      payload: { boardId: 'b1', gameId: 'x01', config: { bullOff: 'wdc' }, players: [{ name: 'Alice' }] },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/bull off needs at least two players/)
  })
})

describe('POST /api/sessions ownership', () => {
  it('returns 403 when board owned by another user', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'other-user' } as any)
    const { app } = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/sessions',
      payload: { boardId: 'b1', gameId: 'atc', config: {}, players: [{ name: 'Alice' }] },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/sessions', () => {
  it('returns an array', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).sessions).toBeInstanceOf(Array)
  })
})

describe('GET /api/sessions/:id', () => {
  it('returns 404 when session not found', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/sessions/nope' })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/sessions/:id', () => {
  it('returns 404 when session not found', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/sessions/nope' })
    expect(res.statusCode).toBe(404)
  })
})

describe('session ownership', () => {
  const session = (id: string, ownerUserId: string, boardId: string | null = null) =>
    ({ id, ownerUserId, boardId, module: { id: 'atc' }, status: 'active', players: [], seats: [], createdAt: new Date() })

  it('creates the session for the signed-in user', async () => {
    const { app, engine } = makeApp()
    await app.inject({ method: 'POST', url: '/api/sessions',
      payload: { boardId: null, gameId: 'atc', config: {}, players: [{ name: 'Alice' }] } })
    expect(engine.create).toHaveBeenCalledWith('user-1', null, 'atc', {}, [{ name: 'Alice' }], null)
  })

  it('gives a board game the board\'s name, as a rebuild would', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValueOnce({ id: 'b1', owner_user_id: 'user-1', name: 'Living room' } as any)
    const { app, engine } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/sessions',
      payload: { boardId: 'b1', gameId: 'atc', config: {}, players: [{ name: 'Alice' }] } })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body)).toEqual({ sessionId: 'sess-1' })
    expect(engine.create).toHaveBeenCalledWith('user-1', 'b1', 'atc', {}, [{ name: 'Alice' }], 'Living room')
  })

  it('returns 409 with the running session when the user already has one', async () => {
    const { app, engine } = makeApp()
    engine.create.mockRejectedValue(new ActiveSessionError('active session already exists for user', 'sess-running', 'user-1'))
    const res = await app.inject({ method: 'POST', url: '/api/sessions',
      payload: { boardId: null, gameId: 'atc', config: {}, players: [{ name: 'Alice' }] } })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: 'You already have a game running', sessionId: 'sess-running' })
  })

  it('lists only the user\'s own sessions', async () => {
    const { app, engine } = makeApp()
    engine.getAllSessions.mockReturnValue([session('mine', 'user-1'), session('theirs', 'user-2')])
    const res = await app.inject({ method: 'GET', url: '/api/sessions' })
    expect(JSON.parse(res.body).sessions.map((s: any) => s.id)).toEqual(['mine'])
  })

  it('forbids reading or ending another user\'s boardless session', async () => {
    const { app, engine } = makeApp()
    engine.getSession.mockReturnValue(session('theirs', 'user-2'))
    expect((await app.inject({ method: 'GET', url: '/api/sessions/theirs' })).statusCode).toBe(403)
    expect((await app.inject({ method: 'DELETE', url: '/api/sessions/theirs' })).statusCode).toBe(403)
    expect(engine.deleteSession).not.toHaveBeenCalled()
  })})

describe('a controller who is not the host', () => {
  const lobbyGame = { id: 's1', ownerUserId: 'user-2', seats: [{ controllerUserId: 'user-1' }], status: 'active', module: { id: 'x01' }, players: [], boardId: null, createdAt: new Date() }

  it('may read the game', async () => {
    const { app, engine } = makeApp()
    engine.getSession.mockReturnValue(lobbyGame)
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).game).toBeNull()
  })

  it('may not end it', async () => {
    const { app, engine } = makeApp()
    engine.getSession.mockReturnValue(lobbyGame)
    expect((await app.inject({ method: 'DELETE', url: '/api/sessions/s1' })).statusCode).toBe(403)
    expect(engine.deleteSession).not.toHaveBeenCalled()
  })
})

describe('sessions: spec enforcement', () => {
  it('checks auth before the body: signed-out + invalid body is 401, not 400', async () => {
    vi.mocked(middleware.requireAuth).mockImplementationOnce((_req: any, reply: any) => {
      reply.code(401).send({ error: 'unauthorized' })
    })
    const { app } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: { nope: 1 } })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a session without players with 400', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/sessions',
      payload: { boardId: null, gameId: 'atc', config: {}, players: [] } })
    expect(res.statusCode).toBe(400)
  })
})
