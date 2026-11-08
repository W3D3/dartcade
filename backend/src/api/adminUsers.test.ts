import { useDbSingleton } from '../test/db.js'
import '../test/authByHeader.js'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { adminUsersApiPlugin } from './adminUsers.js'
import { usersApiPlugin } from './users.js'
import { BridgeConnections, type BridgeConn } from '../bridge-gw/connections.js'
import { insertGameSession, finishGameSession, insertGameDarts } from '../db/queries.js'
import { insertUsers } from '../test/fixtures.js'

// users.ts's name check reads the session; signing in through better-auth isn't what's tested here
vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))

describe.skipIf(!process.env.TEST_DATABASE_URL)('admin users API', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('admin_users_api_test'))
    useDbSingleton(db)
    await insertUsers(db, [
      { id: 'admin', name: 'Admin', emailVerified: true, role: 'admin' },
      { id: 'player', name: 'Player' },
    ])
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

  describe('ranked rating adjustments', () => {
    const adjust = { mode: '1v1', rating: 1400, reason: 'seed fix' }
    it('403s a player and a moderator, 401s a signed-out caller', async () => {
      await insertUsers(db, [{ id: 'rankmod', name: 'RankMod', emailVerified: true, role: 'moderator' }])
      for (const headers of [asPlayer, { 'x-user': 'rankmod' }]) {
        const res = await app().inject({ method: 'POST', url: '/api/admin/users/player/ranked/adjust', headers, payload: adjust })
        expect(res.statusCode).toBe(403)
        const reset = await app().inject({
          method: 'POST',
          url: '/api/admin/users/player/ranked/reset',
          headers,
          payload: { mode: '1v1', reason: 'x' },
        })
        expect(reset.statusCode).toBe(403)
      }
      expect((await app().inject({ method: 'POST', url: '/api/admin/users/player/ranked/adjust', payload: adjust })).statusCode).toBe(401)
    })

    it('requires a reason', async () => {
      for (const reason of ['', '   ']) {
        const res = await app().inject({
          method: 'POST',
          url: '/api/admin/users/player/ranked/adjust',
          headers: asAdmin,
          payload: { ...adjust, reason },
        })
        expect(res.statusCode).toBe(400)
      }
    })

    it('sets, resets and shows both in the audit trail', async () => {
      const set = await app().inject({ method: 'POST', url: '/api/admin/users/player/ranked/adjust', headers: asAdmin, payload: adjust })
      expect(set.statusCode).toBe(200)
      expect(set.json()).toMatchObject({ before: { rating: 1200 }, after: { rating: 1400, matches: 0 } })
      const reset = await app().inject({
        method: 'POST',
        url: '/api/admin/users/player/ranked/reset',
        headers: asAdmin,
        payload: { mode: '1v1', reason: 'placement again' },
      })
      expect(reset.json().after).toMatchObject({ rating: 1400, rankIndex: null, matches: 0 })
      // The admin row shows the new rating, rank and placement from the same data
      const activity = await app().inject({ method: 'GET', url: '/api/admin/users/player/activity', headers: asAdmin })
      expect(activity.json().games.ranked.ratings).toContainEqual({ mode: '1v1', rating: 1400, rankIndex: null, matches: 0 })
      const trail = await app().inject({ method: 'GET', url: '/api/admin/users/player/audit', headers: asAdmin })
      const actions = trail.json().entries.map((e: { action: string }) => e.action)
      expect(actions).toEqual(expect.arrayContaining(['ranked.adjust', 'ranked.reset']))
    })

    it('404s an unknown account', async () => {
      const res = await app().inject({
        method: 'POST',
        url: '/api/admin/users/ghost/ranked/reset',
        headers: asAdmin,
        payload: { mode: '2v2', reason: 'x' },
      })
      expect(res.statusCode).toBe(404)
    })
  })

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
    }))
    await insertUsers(db, rows)
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
    await insertUsers(db, [
      { id: 'zeb', name: 'Zebra One', email: 'zebra1@example.com' },
      { id: 'oth', name: 'Other Two', email: 'other2@example.com' },
    ])
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

  it('gives XP: 403 for a non-admin, 400 for a bad amount, 404 for an unknown id', async () => {
    const give = (headers: Record<string, string>, payload: Record<string, unknown>, id = 'player') =>
      app().inject({ method: 'POST', url: `/api/admin/users/${id}/xp`, headers, payload })
    expect((await give(asPlayer, { amount: 100 })).statusCode).toBe(403)
    for (const amount of [0, 100_001, 1.5, 'lots']) expect((await give(asAdmin, { amount })).statusCode, String(amount)).toBe(400)
    expect((await give(asAdmin, { amount: 100 }, 'ghost')).statusCode).toBe(404)
    const res = await give(asAdmin, { amount: 100 })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ xp: 100, level: 1, unlocked: [] })
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
    await insertUsers(db, [{ id: 'admin2', name: 'Admin Two', role: 'admin' }])
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
      await insertUsers(db, [
        { id: 'mod', name: 'Mod', emailVerified: true, role: 'moderator' },
        { id: 'cheat', name: 'Cheat', emailVerified: true },
        { id: 'admin3', name: 'Admin3', emailVerified: true, role: 'admin' },
      ])
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

    it('lists what was done to an account and to its games, newest first, admin-only', async () => {
      await db
        .insertInto('admin_audit')
        .values([
          { admin_user_id: 'admin', action: 'user.grantXp', target: 'cheat', detail: JSON.stringify({ amount: 5 }) },
          {
            admin_user_id: 'admin',
            action: 'game.invalidate',
            target: 'g1',
            detail: JSON.stringify({ ownerUserId: 'cheat', players: [] }),
          },
          {
            admin_user_id: 'admin',
            action: 'game.invalidate',
            target: 'g2',
            detail: JSON.stringify({ ownerUserId: 'x', players: [{ user_id: 'cheat' }] }),
          },
          {
            admin_user_id: 'admin',
            action: 'game.invalidate',
            target: 'g3',
            detail: JSON.stringify({ ownerUserId: 'x', players: [{ user_id: 'player' }] }),
          },
        ])
        .execute()
      const get = (headers: Record<string, string>) => app().inject({ method: 'GET', url: '/api/admin/users/cheat/audit', headers })
      expect((await get(asPlayer)).statusCode).toBe(403)
      expect((await get({ 'x-user': 'mod' })).statusCode).toBe(403)
      const { entries } = JSON.parse((await get(asAdmin)).body)
      const targets = entries.map((e: { target: string }) => e.target)
      expect(targets.slice(0, 2)).toEqual(['g2', 'g1'])
      expect(targets).not.toContain('g3')
      expect(targets).toContain('cheat')
      expect(entries[0].admin).toEqual({ id: 'admin', name: expect.any(String) })
    })
  })

  describe('bridges and activity', () => {
    const bridges = new BridgeConnections()
    const bapp = () => {
      const a = createFastify()
      a.register(adminUsersApiPlugin, { db, bridges })
      return a
    }
    const dart = (visit: number, i: number, source: 'camera' | 'manual', thrownAt: Date) => ({
      session_id: 'act1',
      visit,
      dart_index: i,
      seat: 0,
      leg: 0,
      phase: 'game' as const,
      segment: { number: 20, multiplier: 1 },
      coords: null,
      source,
      corrected: false,
      thrown_at: thrownAt,
    })

    beforeAll(async () => {
      await insertUsers(db, [{ id: 'owner', name: 'Owner', emailVerified: true }])
      await db
        .insertInto('boards')
        .values([
          { id: 'b1', owner_user_id: 'owner', name: 'Garage', token_hash: 'h1', hardware_id: null },
          { id: 'b2', owner_user_id: 'owner', name: 'Cellar', token_hash: 'h2', hardware_id: null },
        ])
        .execute()
      const conn = { boardDbId: null, bridgeVersion: 'v0.5.0', connectedAt: new Date('2026-11-01T10:00:00Z') } as BridgeConn
      bridges.register(conn, 'b1')
      await insertGameSession(db, {
        id: 'act1',
        owner_user_id: 'owner',
        board_db_id: null,
        game_id: 'x01',
        game_version: 1,
        rng_seed: 0,
        config: {},
        players: [{ name: 'Owner', user_id: 'owner', controller_user_id: 'owner', board_db_id: null, bot_level: null }],
      })
      await finishGameSession(db, 'act1', new Date(), [{ placement: 1, stats: {}, throwPosition: 0, forfeited: false }])
      const old = new Date(Date.now() - 90 * 86_400_000)
      await insertGameDarts(db, [dart(0, 0, 'camera', new Date()), dart(0, 1, 'manual', new Date()), dart(1, 0, 'camera', old)])
      // One ranked game that counts and one a moderator invalidated
      for (const id of ['rk1', 'rk2']) {
        await insertGameSession(db, {
          id,
          owner_user_id: 'owner',
          board_db_id: null,
          game_id: 'x01',
          game_version: 1,
          rng_seed: 0,
          config: {},
          players: [{ name: 'Owner', user_id: 'owner', controller_user_id: 'owner', board_db_id: null, bot_level: null }],
        })
        await db
          .insertInto('ranked_results')
          .values({
            session_id: id,
            user_id: 'owner',
            mode: '1v1',
            won: true,
            placement: false,
            rating_before: 1000,
            rating_after: 1010,
            average: null,
          })
          .execute()
      }
      await sql`UPDATE game_sessions SET invalidated_at = now() WHERE id = 'rk2'`.execute(db)
      await db.insertInto('friendships').values({ id: 'f1', requester_id: 'owner', addressee_id: 'player', status: 'accepted' }).execute()
    })

    it('counts connected bridges against paired ones in the list', async () => {
      const { users } = JSON.parse((await bapp().inject({ method: 'GET', url: '/api/admin/users?q=Owner', headers: asAdmin })).body)
      expect(users[0].bridges).toEqual({ connected: 1, total: 2 })
    })

    it('summarises games, darts split by source, friends and live bridges', async () => {
      const res = await bapp().inject({ method: 'GET', url: '/api/admin/users/owner/activity', headers: asAdmin })
      expect(res.statusCode).toBe(200)
      const a = JSON.parse(res.body)
      expect(a.bridges).toEqual([{ boardId: 'b1', boardName: 'Garage', version: 'v0.5.0', connectedAt: '2026-11-01T10:00:00.000Z' }])
      expect(a.account).toMatchObject({ friends: 1, xp: 0, boards: [{ id: 'b1' }, { id: 'b2' }] })
      expect(a.games.ranked.games).toBe(1)
      expect(a.games).toMatchObject({ total: 1, last30Days: 1, byMode: [{ mode: 'x01', count: 1 }] })
      expect(a.darts).toEqual({ total: 3, manual: 1, last30Days: 2, manualLast30Days: 1 })
    })

    it('404s an unknown id', async () => {
      expect((await bapp().inject({ method: 'GET', url: '/api/admin/users/nobody/activity', headers: asAdmin })).statusCode).toBe(404)
    })

    it('403s a non-admin', async () => {
      expect((await bapp().inject({ method: 'GET', url: '/api/admin/users/owner/activity', headers: asPlayer })).statusCode).toBe(403)
    })
  })
})
