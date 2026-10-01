import type { FastifyInstance, RouteOptions } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import fastifySwagger, { type StaticDocumentSpec } from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
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
import bundledSpec from './schema/api-v1.bundled.json' with { type: 'json' }
import { z } from 'zod'

export type AppDeps = {
  engine: SessionEngine
  db: Kysely<Database>
  /** Built frontend to serve; omitted in tests. */
  frontendDist?: string
  /** Observe route registration (the spec coverage test uses this). */
  onRoute?: (route: RouteOptions) => void
}

// The JSON import types its enums as plain strings, which the OpenAPI types don't accept;
// the document itself is our generated spec, checked here for its top-level shape
const OpenApiShapeSchema = z.object({ openapi: z.string(), info: z.record(z.string(), z.unknown()), paths: z.record(z.string(), z.unknown()) })
function isOpenApiDocument(v: unknown): v is StaticDocumentSpec['document'] {
  return OpenApiShapeSchema.safeParse(v).success
}

// 'urls.primaryName' is a Swagger UI option that @fastify/swagger-ui's types leave out
const swaggerUiConfig = {
  urls: [
    { url: '/api/docs/json', name: 'Dartcade API' },
    { url: '/api/auth/open-api/generate-schema', name: 'Auth (better-auth)' },
  ],
  'urls.primaryName': 'Dartcade API',
}

/** All HTTP/WebSocket routes of the backend, without listening or touching the database. */
export async function buildApp({ engine, db, frontendDist, onRoute }: AppDeps): Promise<FastifyInstance> {
  const app = createFastify()
  if (onRoute) app.addHook('onRoute', onRoute)

  await app.register(fastifyWebsocket)
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

  // API docs: our spec plus better-auth's generated one, in one Swagger UI
  if (!isOpenApiDocument(bundledSpec)) throw new Error('schema/api-v1.bundled.json is not an OpenAPI document')
  await app.register(fastifySwagger, { mode: 'static', specification: { document: bundledSpec } })
  // @fastify/swagger-ui@4.2.0 builds asset links as `.${routePrefix}/static/...`, assuming a
  // single-segment routePrefix; with routePrefix: '/api/docs' that resolves (relative to the
  // no-trailing-slash document URL /api/docs) to /api/api/docs/static/... → 404s, leaving the
  // UI blank. Registering it with routePrefix: '/docs' inside an '/api'-prefixed scope keeps the
  // public URLs identical (/api/docs, /api/docs/json, /api/docs/static/*) while the generated
  // relative links become `./docs/static/...`, which resolves correctly to /api/docs/static/....
  await app.register(async (api) => {
    await api.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: swaggerUiConfig,
    })
  }, { prefix: '/api' })

  app.all('/api/auth/*', async (req, reply) => {
    // Fastify consumes the body stream; expose parsed body so better-call's fallback can re-serialize it
    if (req.body !== undefined) Object.assign(req.raw, { body: req.body })
    void toNodeHandler(auth)(req.raw, reply.raw)
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

  // Any unmatched method+path under our reserved prefixes gets our ErrorResponse 404
  // (not Fastify's default `{ message, error: 'Not Found', statusCode }`); an unmatched
  // GET elsewhere falls through to the SPA's index.html for client-side routing.
  app.setNotFoundHandler((req, reply) => {
    const reserved = req.url.startsWith('/api') || req.url.startsWith('/ws') || req.url.startsWith('/bridge')
    if (!reserved && req.method === 'GET') {
      try { return reply.sendFile('index.html') }
      catch { /* not built yet */ }
    }
    return reply.code(404).send({ error: 'not found' })
  })

  return app
}
