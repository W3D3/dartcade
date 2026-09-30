import type { FastifyInstance, RouteOptions } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import type { Kysely } from 'kysely'
import { toNodeHandler } from 'better-auth/node'
import type { Database } from './db/schema.js'
import type { SessionEngine } from './session/engine.js'
import { bridgeGwPlugin } from './bridge-gw/handler.js'
import { browserGwPlugin } from './browser-gw/handler.js'
import { sessionsApiPlugin } from './api/sessions.js'
import { boardsApiPlugin } from './api/boards.js'
import { pairingApiPlugin } from './api/pairing.js'
import { createFastify } from './api/fastify.js'
import { auth } from './auth/index.js'

export type AppDeps = {
  engine: SessionEngine
  db: Kysely<Database>
  /** Built frontend to serve; omitted in tests. */
  frontendDist?: string
  /** Observe route registration (the spec coverage test uses this). */
  onRoute?: (route: RouteOptions) => void
}

/** All HTTP/WebSocket routes of the backend, without listening or touching the database. */
export async function buildApp({ engine, db, frontendDist, onRoute }: AppDeps): Promise<FastifyInstance> {
  const app = createFastify()
  if (onRoute) app.addHook('onRoute', onRoute)

  await app.register(fastifyWebsocket)
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

  app.all('/api/auth/*', async (req, reply) => {
    // Fastify consumes the body stream; expose parsed body so better-call's fallback can re-serialize it
    if (req.body !== undefined) (req.raw as any).body = req.body
    toNodeHandler(auth)(req.raw, reply.raw)
    return reply.hijack()
  })

  if (frontendDist) {
    try {
      await app.register(fastifyStatic, { root: frontendDist, wildcard: false })
    } catch { /* not built yet */ }
  }

  await app.register(bridgeGwPlugin, { engine, db })
  await app.register(browserGwPlugin, { engine })
  await app.register(sessionsApiPlugin, { engine, db })
  await app.register(boardsApiPlugin, { db })
  await app.register(pairingApiPlugin, { db })

  app.get('*', async (req, reply) => {
    if (
      req.url.startsWith('/api') ||
      req.url.startsWith('/ws') ||
      req.url.startsWith('/bridge')
    ) return reply.code(404).send({ error: 'not found' })
    try { return reply.sendFile('index.html') }
    catch { return reply.code(404).send({ error: 'not found' }) }
  })

  return app
}
