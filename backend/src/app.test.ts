import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AddressInfo } from 'net'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp, WS_MAX_PAYLOAD } from './app.js'

vi.mock('./db/queries.js', async orig => ({
  ...(await orig<typeof import('./db/queries.js')>()),
  getBoardByTokenHash: () => new Promise(() => {}),
}))

// Spy on the raw request better-call sees, to check what the /api/auth/* handler did to its
// headers, without needing a real session or DB round-trip.
let seenClientIpHeader: string | string[] | undefined
vi.mock('better-auth/node', async orig => {
  const mod = await orig<typeof import('better-auth/node')>()
  return {
    ...mod,
    toNodeHandler: (...args: Parameters<typeof mod.toNodeHandler>) => {
      const handler = mod.toNodeHandler(...args)
      return (req: Parameters<typeof handler>[0], res: Parameters<typeof handler>[1]) => {
        seenClientIpHeader = req.headers['x-dartcade-client-ip']
        return handler(req, res)
      }
    },
  }
})

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

describe('link previews', () => {
  const frontendDist = mkdtempSync(join(tmpdir(), 'dist-'))
  writeFileSync(join(frontendDist, 'index.html'), '<meta property="og:image" content="__ORIGIN__/og-image.png">')
  afterEach(() => vi.unstubAllEnvs())

  it.each(['/', '/some/spa/route'])('GET %s serves index.html with absolute URLs from PUBLIC_URL', async url => {
    vi.stubEnv('PUBLIC_URL', 'https://darts.example.com/')
    const app = await buildApp({ ...deps(), frontendDist })
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toBe('<meta property="og:image" content="https://darts.example.com/og-image.png">')
    await app.close()
  })

  it('leaves the URLs relative without PUBLIC_URL', async () => {
    vi.stubEnv('PUBLIC_URL', '')
    const app = await buildApp({ ...deps(), frontendDist })
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.body).toBe('<meta property="og:image" content="/og-image.png">')
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

  it('closes a socket sent a message over WS_MAX_PAYLOAD (1009), before it is authenticated', async () => {
    const app = await buildApp(deps())
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const { port } = app.server.address() as AddressInfo
      // The bridge socket stays open while its token is checked, which here never answers
      const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`)
      await new Promise(resolve => ws.addEventListener('open', resolve))
      const closed = new Promise(resolve => ws.addEventListener('close', e => resolve(e.code)))
      ws.send(new Uint8Array(WS_MAX_PAYLOAD + 1))
      expect(await Promise.race([closed, new Promise(resolve => setTimeout(() => resolve('still open'), 2000))])).toBe(1009)
    } finally {
      await app.close()
    }
  })
})

describe('/api/auth/* client IP', () => {
  it("overwrites a client-sent x-dartcade-client-ip with Fastify's own req.ip, so it can't be spoofed", async () => {
    seenClientIpHeader = undefined
    const app = await buildApp(deps())
    try {
      const res = await app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { 'x-dartcade-client-ip': '6.6.6.6' } })
      expect(res.statusCode).toBeLessThan(500)
      expect(seenClientIpHeader).toBeDefined()
      expect(seenClientIpHeader).not.toBe('6.6.6.6')
    } finally {
      await app.close()
    }
  })
})
