import { describe, it, expect } from 'vitest'
import { buildApp } from './app.js'

describe('unmatched routes', () => {
  it("POST /api/nope returns 404 with our ErrorResponse shape, not Fastify's default", async () => {
    const app = await buildApp({ engine: {} as any, db: {} as any, lobbies: {} as any, hub: {} as any, friends: {} as any })
    const res = await app.inject({ method: 'POST', url: '/api/nope' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body)).toEqual({ error: 'not found' })
    await app.close()
  })

  it('DELETE /ws/nope and PUT /bridge/nope also get our 404 shape', async () => {
    const app = await buildApp({ engine: {} as any, db: {} as any, lobbies: {} as any, hub: {} as any, friends: {} as any })
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
    const app = await buildApp({ engine: {} as any, db: {} as any, lobbies: {} as any, hub: {} as any, friends: {} as any })
    const res = await app.inject({ method: 'GET', url: '/some/spa/route' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body)).toEqual({ error: 'not found' })
    await app.close()
  })
})
