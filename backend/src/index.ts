import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { toNodeHandler } from 'better-auth/node'
import { db } from './db/index.js'
import { runMigrations } from './db/queries.js'
import { SessionEngine, createEngineStore } from './session/engine.js'
import { bridgeGwPlugin } from './bridge-gw/handler.js'
import { browserGwPlugin, pushSnapshot } from './browser-gw/handler.js'
import { sessionsApiPlugin } from './api/sessions.js'
import { boardsApiPlugin } from './api/boards.js'
import { boardApiPlugin } from './api/board.js'
import { auth } from './auth/index.js'
import { seedDev } from './auth/seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL
const PORT = parseInt(process.env.PORT ?? '3000', 10)

if (!DATABASE_URL) throw new Error('DATABASE_URL is required')

await runMigrations(db)
await seedDev()

let engine: SessionEngine
const push = (sessionId: string) => pushSnapshot(sessionId, engine)
engine = new SessionEngine(createEngineStore(db), push)
await engine.rebuild()

const app = Fastify({ logger: true })
await app.register(fastifyWebsocket)

app.all('/api/auth/*', async (req, reply) => {
  toNodeHandler(auth)(req.raw, reply.raw)
  return reply.hijack()
})

const frontendDist = join(__dirname, '../../frontend/dist')
try {
  await app.register(fastifyStatic, { root: frontendDist, wildcard: false })
} catch { /* not built yet */ }

await app.register(bridgeGwPlugin, { engine, db })
await app.register(browserGwPlugin, { engine })
await app.register(sessionsApiPlugin, { engine, db })
await app.register(boardsApiPlugin, { db })
await app.register(boardApiPlugin)

app.get('*', async (req, reply) => {
  if (
    req.url.startsWith('/api') ||
    req.url.startsWith('/ws') ||
    req.url.startsWith('/bridge')
  ) return reply.code(404).send({ error: 'not found' })
  try { return reply.sendFile('index.html') }
  catch { return reply.code(404).send({ error: 'not found' }) }
})

await app.listen({ port: PORT, host: '0.0.0.0' })
