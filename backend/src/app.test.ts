import { describe, it, expect, vi } from 'vitest'
import { buildApp } from './app.js'

const deps = () => ({ engine: {} as any, db: {} as any, lobbies: {} as any, hub: {} as any, friends: {} as any })

describe('unmatched routes', () => {
  it("POST /api/nope returns 404 with our ErrorResponse shape, not Fastify's default", async () => {
    const app = await buildApp(deps())
    const res = await app.inject({ method: 'POST', url: '/api/nope' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body)).toEqual({ error: 'not found' })
    await app.close()
  })

  it('DELETE /ws/nope and PUT /bridge/nope also get our 404 shape', async () => {
    const app = await buildApp(deps())
    for (const { method, url } of [
      { method: 'DELETE' as const, url: '/ws/nope' },
      { method: 'PUT' as const, url: '/bridge/nope' },
    ]) {
      const res = await app.inject({ method, url })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.body)).toEqual({ error: 'not found' })
    }
    await app.close()
  })

  it('GET on an unmatched non-reserved path still falls through to a 404 (no built frontend in tests)', async () => {
    const app = await buildApp(deps())
    const res = await app.inject({ method: 'GET', url: '/some/spa/route' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body)).toEqual({ error: 'not found' })
    await app.close()
  })
})

describe('malformed requests', () => {
  it.each([{ host: 'local host' }, { 'x-forwarded-proto': 'a b' }])('auth answers 400 to %o instead of crashing', async headers => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const app = await buildApp(deps())
    try {
      const res = await app.inject({ method: 'GET', url: '/api/auth/get-session', headers })
      await new Promise(r => setTimeout(r, 50))
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body)).toEqual({ error: 'bad request' })
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
      await app.close()
    }
  })
})
