import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { sessionsApiPlugin } from './sessions.js'

function makeApp() {
  const engine = {
    create: vi.fn().mockResolvedValue({ sessionId: 'sess-1' }),
    getSession: vi.fn().mockReturnValue(undefined),
    getAllSessions: vi.fn().mockReturnValue([]),
    getSnapshot: vi.fn().mockReturnValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(true),
  } as any
  const app = Fastify()
  app.register(sessionsApiPlugin, { engine })
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
})

describe('GET /api/games', () => {
  it('returns atc in the games list', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/games' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.games.find((g: any) => g.id === 'atc')).toBeDefined()
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
  it('returns 204 on success', async () => {
    const { app } = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/sessions/sess-1' })
    expect(res.statusCode).toBe(204)
  })

  it('returns 404 when session not found', async () => {
    const { app, engine } = makeApp()
    engine.deleteSession.mockResolvedValue(false)
    const res = await app.inject({ method: 'DELETE', url: '/api/sessions/nope' })
    expect(res.statusCode).toBe(404)
  })
})
