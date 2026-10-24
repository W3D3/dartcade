import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { adminUsersApiPlugin } from './adminUsers.js'
import { usersApiPlugin } from './users.js'

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

// users.ts's name check reads the session; signing in through better-auth isn't what's tested here
vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))

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
        { id: 'admin', name: 'Admin', email: 'admin@example.com', emailVerified: true, image: null, role: 'admin' },
        { id: 'player', name: 'Player', email: 'player@example.com', emailVerified: false, image: null, role: null },
      ])
      .execute()
    await db
      .updateTable('user')
      .set({ last_login_at: new Date('2026-01-01T00:00:00Z') })
      .where('id', '=', 'admin')
      .execute()
    // Warm the pg pool with a few concurrent connections: cold, the concurrency test below
    // can see one request's whole transaction finish before the other's first query even lands.
    await Promise.all(Array.from({ length: 4 }, () => db.selectFrom('user').select('id').execute()))
  })
  afterAll(async () => {
    await close()
  })

  const onBanned = vi.fn(async (_userId: string) => {})
  function app() {
    const a = createFastify()
    a.register(adminUsersApiPlugin, { db, onBanned })
    a.register(usersApiPlugin, { db })
    return a
  }
  const asAdmin = { 'x-user': 'admin' }
  const asPlayer = { 'x-user': 'player' }

  it('403s a non-admin on both routes', async () => {
    const list = await app().inject({ method: 'GET', url: '/api/admin/users', headers: asPlayer })
    expect(list.statusCode).toBe(403)

    const role = await app().inject({ method: 'PUT', url: '/api/admin/users/player/role', headers: asPlayer, payload: { role: 'admin' } })
    expect(role.statusCode).toBe(403)

    const verified = await app().inject({
      method: 'PUT',
      url: '/api/admin/users/player/verified',
      headers: asPlayer,
      payload: { verified: true },
    })
    expect(verified.statusCode).toBe(403)
  })

  it('includes emailVerified and lastLoginAt, null until a sign-in sets it', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/admin/users', headers: asAdmin })
    const byId = Object.fromEntries(res.json().users.map((u: { id: string }) => [u.id, u]))
    expect(byId.admin).toMatchObject({ emailVerified: true, lastLoginAt: '2026-01-01T00:00:00.000Z' })
    expect(byId.player).toMatchObject({ emailVerified: false, lastLoginAt: null })
  })

  it('caps the list at 200, newest first', async () => {
    const rows = Array.from({ length: 199 }, (_, i) => ({
      id: `bulk${i}`,
      name: `Bulk${i}`,
      email: `bulk${i}@example.com`,
      emailVerified: false,
      image: null,
      role: null,
    }))
    await db.insertInto('user').values(rows).execute()
    try {
      const res = await app().inject({ method: 'GET', url: '/api/admin/users', headers: asAdmin })
      expect(res.json().users).toHaveLength(200)
    } finally {
      await db
        .deleteFrom('user')
        .where(
          'id',
          'in',
          rows.map(r => r.id),
        )
        .execute()
    }
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
    const res = await app().inject({ method: 'PUT', url: '/api/admin/users/nope/role', headers: asAdmin, payload: { role: 'admin' } })
    expect(res.statusCode).toBe(404)

    const verified = await app().inject({
      method: 'PUT',
      url: '/api/admin/users/nope/verified',
      headers: asAdmin,
      payload: { verified: true },
    })
    expect(verified.statusCode).toBe(404)
  })

  it('400s a verified body that is not a boolean', async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/admin/users/player/verified',
      headers: asAdmin,
      payload: { verified: 'yes' },
    })
    expect(res.statusCode).toBe(400)
  })

  // Fastify's default Ajv options strip unknown body fields (removeAdditional, see fastify.ts) on every
  // route, this one included: an extra field is dropped, not rejected, and the request still succeeds.
  it('drops an unknown field from a verified body instead of rejecting it', async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/admin/users/player/verified',
      headers: asAdmin,
      payload: { verified: true, admin: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: 'player', emailVerified: true })
    await app().inject({ method: 'PUT', url: '/api/admin/users/player/verified', headers: asAdmin, payload: { verified: false } })
  })

  it('promotes then demotes a user', async () => {
    const promoted = await app().inject({
      method: 'PUT',
      url: '/api/admin/users/player/role',
      headers: asAdmin,
      payload: { role: 'admin' },
    })
    expect(promoted.statusCode).toBe(200)
    expect(promoted.json()).toMatchObject({ id: 'player', role: 'admin' })

    const demoted = await app().inject({ method: 'PUT', url: '/api/admin/users/player/role', headers: asAdmin, payload: { role: null } })
    expect(demoted.statusCode).toBe(200)
    expect(demoted.json()).toMatchObject({ id: 'player', role: null })
  })

  it('makes a moderator, and a moderator is no admin (403 on the user routes)', async () => {
    const made = await app().inject({
      method: 'PUT',
      url: '/api/admin/users/player/role',
      headers: asAdmin,
      payload: { role: 'moderator' },
    })
    expect(made.statusCode).toBe(200)
    expect(made.json()).toMatchObject({ id: 'player', role: 'moderator' })
    expect((await app().inject({ method: 'GET', url: '/api/admin/users', headers: asPlayer })).statusCode).toBe(403)
    const demoted = await app().inject({ method: 'PUT', url: '/api/admin/users/player/role', headers: asAdmin, payload: { role: null } })
    expect(demoted.json()).toMatchObject({ id: 'player', role: null })
  })

  it('400s an unknown role', async () => {
    const res = await app().inject({ method: 'PUT', url: '/api/admin/users/player/role', headers: asAdmin, payload: { role: 'owner' } })
    expect(res.statusCode).toBe(400)
  })

  it('refuses to turn the only admin into a moderator', async () => {
    const res = await app().inject({ method: 'PUT', url: '/api/admin/users/admin/role', headers: asAdmin, payload: { role: 'moderator' } })
    expect(res.statusCode).toBe(409)
  })

  it('verifies then unverifies an email, visible in the list', async () => {
    const verified = await app().inject({
      method: 'PUT',
      url: '/api/admin/users/player/verified',
      headers: asAdmin,
      payload: { verified: true },
    })
    expect(verified.statusCode).toBe(200)
    expect(verified.json()).toMatchObject({ id: 'player', emailVerified: true })

    const afterVerify = await app().inject({ method: 'GET', url: '/api/admin/users', headers: asAdmin })
    expect(afterVerify.json().users.find((u: { id: string }) => u.id === 'player')).toMatchObject({ emailVerified: true })

    const unverified = await app().inject({
      method: 'PUT',
      url: '/api/admin/users/player/verified',
      headers: asAdmin,
      payload: { verified: false },
    })
    expect(unverified.statusCode).toBe(200)
    expect(unverified.json()).toMatchObject({ id: 'player', emailVerified: false })

    const afterUnverify = await app().inject({ method: 'GET', url: '/api/admin/users', headers: asAdmin })
    expect(afterUnverify.json().users.find((u: { id: string }) => u.id === 'player')).toMatchObject({ emailVerified: false })
  })

  it('refuses to demote the only admin', async () => {
    const res = await app().inject({ method: 'PUT', url: '/api/admin/users/admin/role', headers: asAdmin, payload: { role: null } })
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
        a.inject({ method: 'PUT', url: '/api/admin/users/admin2/role', headers: asAdmin, payload: { role: null } }),
        a.inject({ method: 'PUT', url: '/api/admin/users/admin/role', headers: { 'x-user': 'admin2' }, payload: { role: null } }),
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

  describe('bans', () => {
    const in7Days = () => new Date(Date.now() + 7 * 86_400_000).toISOString()
    const ban = (target: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
      app().inject({ method: 'PUT', url: `/api/admin/users/${target}/ban`, headers, payload })
    const audit = (action: string, target: string) =>
      db
        .selectFrom('admin_audit')
        .select(['admin_user_id', 'detail'])
        .where('action', '=', action)
        .where('target', '=', target)
        .orderBy('id')
        .execute()

    beforeAll(async () => {
      await db
        .insertInto('user')
        .values([
          { id: 'mod', name: 'Mod', email: 'mod@example.com', emailVerified: true, image: null, role: 'moderator' },
          { id: 'cheat', name: 'Cheat', email: 'cheat@example.com', emailVerified: true, image: null, role: null },
          { id: 'admin3', name: 'Admin3', email: 'admin3@example.com', emailVerified: true, image: null, role: 'admin' },
        ])
        .execute()
    })

    it('is admin-only: a moderator and a player are refused, and nothing changes', async () => {
      for (const headers of [{ 'x-user': 'mod' }, asPlayer]) {
        expect((await ban('cheat', headers, { category: 'cheating', note: null, until: null })).statusCode).toBe(403)
        expect((await app().inject({ method: 'DELETE', url: '/api/admin/users/cheat/ban', headers })).statusCode).toBe(403)
      }
      const row = await db.selectFrom('user').select('banned').where('id', '=', 'cheat').executeTakeFirstOrThrow()
      expect(row.banned).toBe(false)
      expect(onBanned).not.toHaveBeenCalled()
    })

    it("refuses to ban yourself, another admin, or a ban that's already over", async () => {
      expect((await ban('admin', asAdmin, { category: 'other', note: null, until: null })).statusCode).toBe(409)
      expect((await ban('admin3', asAdmin, { category: 'other', note: null, until: null })).statusCode).toBe(409)
      expect((await ban('cheat', asAdmin, { category: 'other', note: null, until: '2020-01-01T00:00:00Z' })).statusCode).toBe(400)
      expect((await ban('ghost', asAdmin, { category: 'other', note: null, until: null })).statusCode).toBe(404)
      expect(await audit('user.ban', 'admin3')).toEqual([])
      expect(onBanned).not.toHaveBeenCalled()
    })

    it('bans with a category, a note and an end: signs them out, runs the effects, audits it', async () => {
      await db
        .insertInto('session')
        .values({ id: 's1', token: 't1', userId: 'cheat', expiresAt: new Date(Date.now() + 86_400_000) })
        .execute()
      const until = in7Days()
      const res = await ban('cheat', asAdmin, { category: 'cheating', note: '  typed-in 180s  ', until })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).ban).toEqual({ category: 'cheating', until, note: 'typed-in 180s' })
      expect(await db.selectFrom('session').select('id').where('userId', '=', 'cheat').execute()).toEqual([])
      expect(onBanned).toHaveBeenCalledWith('cheat')
      expect(await audit('user.ban', 'cheat')).toEqual([
        { admin_user_id: 'admin', detail: { category: 'cheating', note: 'typed-in 180s', until } },
      ])
      const list = await app().inject({ method: 'GET', url: '/api/admin/users?q=cheat', headers: asAdmin })
      expect(JSON.parse(list.body).users[0].ban).toEqual({ category: 'cheating', until, note: 'typed-in 180s' })
    })

    it("shows the ban on the profile, never the admin's note", async () => {
      const res = await app().inject({ method: 'GET', url: '/api/users/cheat/ban', headers: asPlayer })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toEqual({ ban: { category: 'cheating', until: expect.any(String) } })
      expect(res.body).not.toContain('180s')
    })

    it('ends a timed ban by itself at its expiry', async () => {
      await db
        .updateTable('user')
        .set({ banExpires: new Date(Date.now() - 1000) })
        .where('id', '=', 'cheat')
        .execute()
      const profile = await app().inject({ method: 'GET', url: '/api/users/cheat/ban', headers: asPlayer })
      expect(JSON.parse(profile.body)).toEqual({ ban: null })
      const list = await app().inject({ method: 'GET', url: '/api/admin/users?q=cheat', headers: asAdmin })
      expect(JSON.parse(list.body).users[0].ban).toBeNull()
    })

    it('unbans, and audits what the ban was', async () => {
      await ban('cheat', asAdmin, { category: 'spamming', note: null, until: null })
      const res = await app().inject({ method: 'DELETE', url: '/api/admin/users/cheat/ban', headers: asAdmin })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).ban).toBeNull()
      expect(JSON.parse((await app().inject({ method: 'GET', url: '/api/users/cheat/ban', headers: asPlayer })).body)).toEqual({
        ban: null,
      })
      expect(await audit('user.unban', 'cheat')).toEqual([
        { admin_user_id: 'admin', detail: { was: { category: 'spamming', until: null } } },
      ])
    })
  })
})
