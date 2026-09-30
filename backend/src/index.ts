import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db } from './db/index.js'
import { runMigrations } from './db/queries.js'
import { SessionEngine, createEngineStore } from './session/engine.js'
import { pushSnapshot } from './browser-gw/handler.js'
import { seedDev } from './auth/seed.js'
import { buildApp } from './app.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL =
  process.env.DATABASE_URL ??
  (process.env.PGHOST
    ? `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE}`
    : undefined)
const PORT = parseInt(process.env.PORT ?? '3000', 10)

if (!DATABASE_URL) throw new Error('DATABASE_URL or PG* env vars are required')

await runMigrations(db)
await seedDev()

// The push callback only runs after the engine exists
const engine: SessionEngine = new SessionEngine(createEngineStore(db), sessionId => { pushSnapshot(sessionId, engine) })
await engine.rebuild()

const app = await buildApp({ engine, db, frontendDist: join(__dirname, '../../frontend/dist') })
await app.listen({ port: PORT, host: '0.0.0.0' })
