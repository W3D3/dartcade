import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { adminUsersApiPlugin } from './adminUsers.js'

// Signed in as whoever the x-user header names; without it, not signed in (voices.test.ts's pattern)
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

// requireAdmin (auth/admin.ts) reads the db singleton (db/index.ts) directly, not a plugin opt;
// redirect it to the test schema so a real `role` column decides who is an admin.
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

describe.skipIf(!process.env.TEST_DATABASE_URL)('admin users API', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('admin_users_api_test'))
    dbRef.current = db
    await db
      .insertInto('user')
      .values([
        { id: 'admin', name: 'Admin', email: 'admin@example.com', emailVerified: false, image: null, role: 'admin' },
        { id: 'player', name: 'Player', email: 'player@example.com', emailVerified: false, image: null, role: null },
      ])
      .execute()
    // Warm the pg pool with a few concurrent connections: cold, the concurrency test below
    // can see one request's whole transaction finish before the other's first query even lands.
    await Promise.all(Array.from({ length: 4 }, () => db.selectFrom('user').select('id').execute()))
  })
  afterAll(async () => {
    await close()
  })

  function app() {
    const a = createFastify()
    a.register(adminUsersApiPlugin, { db })
    return a
  }
  const asAdmin = { 'x-user': 'admin' }
  const asPlayer = { 'x-user': 'player' }

  it('403s a non-admin on both routes', async () => {
    const list = await app().inject({ method: 'GET', url: '/api/admin/users', headers: asPlayer })
    expect(list.statusCode).toBe(403)

    const role = await app().inject({ method: 'PUT', url: '/api/admin/users/player/role', headers: asPlayer, payload: { admin: true } })
    expect(role.statusCode).toBe(403)
  })

  it('lists users and filters by q, case-insensitive, matching name or email', async () => {
    await db
      .insertInto('user')
      .values([
        { id: 'zeb', name: 'Zebra One', email: 'zebra1@example.com', emailVerified: false, image: null, role: null },
        { id: 'oth', name: 'Other Two', email: 'other2@example.com', emailVerified: false, image: null, role: null },
      ])
      .execute()
    try {
      const all = await app().inject({ method: 'GET', url: '/api/admin/users', headers: asAdmin })
      expect(all.statusCode).toBe(200)
      const ids = all.json().users.map((u: { id: string }) => u.id)
      expect(ids).toEqual(expect.arrayContaining(['admin', 'player', 'zeb', 'oth']))

      const byName = await app().inject({ method: 'GET', url: '/api/admin/users?q=ZEBRA', headers: asAdmin })
      expect(byName.json().users.map((u: { id: string }) => u.id)).toEqual(['zeb'])

      const byEmail = await app().inject({ method: 'GET', url: '/api/admin/users?q=other2', headers: asAdmin })
      expect(byEmail.json().users.map((u: { id: string }) => u.id)).toEqual(['oth'])
    } finally {
      await db.deleteFrom('user').where('id', 'in', ['zeb', 'oth']).execute()
    }
  })

  it('404s an unknown id', async () => {
    const res = await app().inject({ method: 'PUT', url: '/api/admin/users/nope/role', headers: asAdmin, payload: { admin: true } })
    expect(res.statusCode).toBe(404)
  })

  it('promotes then demotes a user', async () => {
    const promoted = await app().inject({ method: 'PUT', url: '/api/admin/users/player/role', headers: asAdmin, payload: { admin: true } })
    expect(promoted.statusCode).toBe(200)
    expect(promoted.json()).toMatchObject({ id: 'player', role: 'admin' })

    const demoted = await app().inject({ method: 'PUT', url: '/api/admin/users/player/role', headers: asAdmin, payload: { admin: false } })
    expect(demoted.statusCode).toBe(200)
    expect(demoted.json()).toMatchObject({ id: 'player', role: null })
  })

  it('refuses to demote the only admin', async () => {
    const res = await app().inject({ method: 'PUT', url: '/api/admin/users/admin/role', headers: asAdmin, payload: { admin: false } })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'There must be at least one admin' })
  })

  it('two admins demoting each other concurrently: one wins, the other is refused, one admin left', async () => {
    await db
      .insertInto('user')
      .values({ id: 'admin2', name: 'Admin Two', email: 'admin2@example.com', emailVerified: false, image: null, role: 'admin' })
      .execute()
    try {
      // One ready instance for both: two fresh apps would boot at slightly different times and
      // skew which request's queries actually run first, hiding the lock race this test is for.
      const a = app()
      await a.ready()
      const [r1, r2] = await Promise.all([
        a.inject({ method: 'PUT', url: '/api/admin/users/admin2/role', headers: asAdmin, payload: { admin: false } }),
        a.inject({ method: 'PUT', url: '/api/admin/users/admin/role', headers: { 'x-user': 'admin2' }, payload: { admin: false } }),
      ])
      const codes = [r1.statusCode, r2.statusCode]
      // 403 if the first request demotes before the second's requireAdmin check; 409 if the last-admin guard catches it.
      expect(codes).toContainEqual(200)
      expect([403, 409]).toContainEqual(codes.find(c => c !== 200))

      const remaining = await db
        .selectFrom('user')
        .select('id')
        .where('role', '=', 'admin')
        .where('id', 'in', ['admin', 'admin2'])
        .execute()
      expect(remaining).toHaveLength(1)
    } finally {
      await db.deleteFrom('user').where('id', '=', 'admin2').execute()
      await db.updateTable('user').set({ role: 'admin' }).where('id', '=', 'admin').execute()
    }
  })
})
