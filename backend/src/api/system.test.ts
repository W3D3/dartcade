import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { systemApiPlugin } from './system.js'

// Signed in as whoever the x-user header names; without it, not signed in (adminUsers.test.ts's pattern)
vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, reply: any, done: () => void) => {
    if (!req.headers['x-user']) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    req.userId = req.headers['x-user']
    done()
  }),
}))

// requireAdmin reads the db singleton: point it at the test schema
const dbRef = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../db/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../db/index.js')>()
  return {
    ...actual,
    get db() {
      return dbRef.current
    },
  }
})

const SECRETS = {
  BETTER_AUTH_SECRET: 'secret-auth-value',
  BRIDGE_SECRET: 'secret-bridge-value',
  ADMIN_EMAIL: 'boss@example.com',
  ADMIN_PASSWORD: 'secret-admin-password',
  DATABASE_URL: 'postgres://user:secret-db-password@db/dartcade',
}
const env = { ...SECRETS, APP_VERSION: 'v0.3.0', APP_COMMIT: 'abc1234', FLAGS_ON: 'matchmaking.enabled' }
const live = { browsers: 3, bridges: 1, boardsOnline: 1, runningGames: 2, openLobbies: 4 }

describe('GET /api/version', () => {
  it('answers the build, signed out', async () => {
    const app = createFastify()
    await app.register(systemApiPlugin, { db: undefined as never, live: () => Promise.resolve(live), env })
    const res = await app.inject({ method: 'GET', url: '/api/version' })
    expect(res.json()).toEqual({ version: 'v0.3.0', commit: 'abc1234', buildTime: null })
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('GET /api/admin/system', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('admin_system_api_test'))
    dbRef.current = db
    await db
      .insertInto('user')
      .values([
        { id: 'admin', name: 'Admin', email: 'admin@example.com', emailVerified: true, image: null, role: 'admin' },
        { id: 'player', name: 'Player', email: 'player@example.com', emailVerified: true, image: null, role: null },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })

  async function get(user?: string) {
    const app = createFastify()
    await app.register(systemApiPlugin, { db, live: () => Promise.resolve(live), env })
    return app.inject({ method: 'GET', url: '/api/admin/system', headers: user ? { 'x-user': user } : {} })
  }

  it('401s signed out and 403s a non-admin', async () => {
    expect((await get()).statusCode).toBe(401)
    expect((await get('player')).statusCode).toBe(403)
  })

  it('answers the build, runtime, database, live counts and config', async () => {
    const res = await get('admin')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.build).toEqual({ version: 'v0.3.0', commit: 'abc1234', buildTime: null, preview: null })
    expect(body.runtime.node).toBe(process.version)
    expect(body.database.serverVersion).toMatch(/^\d+/)
    expect(body.database.latestMigration).toMatch(/\.sql$/)
    expect(body.database.sizeBytes).toBeGreaterThan(0)
    expect(body.database.pool.total).toBeGreaterThan(0)
    expect(body.live).toEqual(live)
    expect(body.config.values.FLAGS_ON).toBe('matchmaking.enabled')
    expect(body.config.secrets).toEqual(Object.fromEntries(Object.keys(SECRETS).map(k => [k, true])))
  })

  it('never answers a secret value', async () => {
    const text = (await get('admin')).body
    for (const value of Object.values(SECRETS)) expect(text).not.toContain(value)
  })
})
