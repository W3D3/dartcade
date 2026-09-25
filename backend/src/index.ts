import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createDb } from './db/index.js'
import { runMigrations } from './db/queries.js'
import { SessionEngine, createEngineStore } from './session/engine.js'
import { bridgeGwPlugin } from './bridge-gw/handler.js'
import { browserGwPlugin, pushSnapshot } from './browser-gw/handler.js'
import { sessionsApiPlugin } from './api/sessions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL
const BRIDGE_SECRET = process.env.BRIDGE_SECRET
const PORT = parseInt(process.env.PORT ?? '3000', 10)

if (!DATABASE_URL) throw new Error('DATABASE_URL is required')
if (!BRIDGE_SECRET) throw new Error('BRIDGE_SECRET is required')

const db = createDb(DATABASE_URL)
await runMigrations(db)

// engine is declared before push because push closes over engine
let engine: SessionEngine
const push = (sessionId: string) => pushSnapshot(sessionId, engine)
engine = new SessionEngine(createEngineStore(db), push)
await engine.rebuild()

const app = Fastify({ logger: true })
await app.register(fastifyWebsocket)

// Serve built frontend static files (only present in production build)
const frontendDist = join(__dirname, '../../frontend/dist')
try {
  await app.register(fastifyStatic, { root: frontendDist, wildcard: false })
} catch {
  // Frontend dist not available (dev mode) — skip static serving
}

await app.register(bridgeGwPlugin, { secret: BRIDGE_SECRET, engine, db })
await app.register(browserGwPlugin, { engine })
await app.register(sessionsApiPlugin, { engine })

// SPA fallback: all non-API/WS routes serve index.html
app.get('*', async (req, reply) => {
  if (
    req.url.startsWith('/api') ||
    req.url.startsWith('/ws') ||
    req.url.startsWith('/bridge') ||
    req.url === '/health'
  ) {
    return reply.code(404).send({ error: 'not found' })
  }
  try {
    return reply.sendFile('index.html')
  } catch {
    return reply.code(404).send({ error: 'not found' })
  }
})

await app.listen({ port: PORT, host: '0.0.0.0' })
