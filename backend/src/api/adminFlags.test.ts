import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { adminFlagsApiPlugin } from './adminFlags.js'
import { ofrepApiPlugin } from './ofrep.js'
import { setOverrides, setupFlags } from '../flags/index.js'

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

// ofrep.ts reads the signed-in user through getAuthUser; map it to x-user the same way
vi.mock('../auth/session.js', () => ({
  getAuthUser: vi.fn((req: any) => (req.headers['x-user'] ? { userId: req.headers['x-user'] } : null)),
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

describe.skipIf(!process.env.TEST_DATABASE_URL)('admin flags API', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('admin_flags_api_test'))
    dbRef.current = db
    await setupFlags(new Set())
    await db
      .insertInto('user')
      .values([
        { id: 'admin', name: 'Admin', email: 'admin@example.com', emailVerified: false, image: null, role: 'admin' },
        { id: 'player', name: 'Player', email: 'player@example.com', emailVerified: false, image: null, role: null },
        { id: 'other', name: 'Other', email: 'other@example.com', emailVerified: false, image: null, role: null },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })
  afterEach(async () => {
    await setOverrides(new Map())
    await db.deleteFrom('feature_flag_overrides').execute()
  })

  function app() {
    const a = createFastify()
    a.register(adminFlagsApiPlugin, { db })
    a.register(ofrepApiPlugin, { db })
    return a
  }
  const asAdmin = { 'x-user': 'admin' }
  const asPlayer = { 'x-user': 'player' }
  const findFlag = (body: { flags: { key: string }[] }, key: string) => body.flags.find(f => f.key === key)

  it('403s a non-admin on all three routes', async () => {
    const list = await app().inject({ method: 'GET', url: '/api/admin/flags', headers: asPlayer })
    expect(list.statusCode).toBe(403)

    const put = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.p121.enabled',
      headers: asPlayer,
      payload: { mode: 'on' },
    })
    expect(put.statusCode).toBe(403)

    const del = await app().inject({ method: 'DELETE', url: '/api/admin/flags/gamemode.p121.enabled', headers: asPlayer })
    expect(del.statusCode).toBe(403)
  })

  it('lists every flag with its default and no override', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/admin/flags', headers: asAdmin })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(findFlag(body, 'gamemode.p121.enabled')).toMatchObject({
      kind: 'boolean',
      default: { rule: 'admins', envOn: false },
      override: null,
      value: true, // the requesting admin
    })
    expect(findFlag(body, 'matchmaking.visitSeconds')).toMatchObject({
      kind: 'number',
      range: [10, 300],
      default: { value: 60 },
      override: null,
      value: 60,
    })
    expect(body.stale).toEqual([])
  })

  it('turns a flag on for everyone, applied immediately over OFREP with no restart', async () => {
    const put = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.p121.enabled',
      headers: asAdmin,
      payload: { mode: 'on' },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toMatchObject({ override: { mode: 'on', updatedBy: { id: 'admin', name: 'Admin' } }, value: true })

    const ofrep = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers: asPlayer, payload: {} })
    expect(findFlag(ofrep.json(), 'gamemode.p121.enabled')).toMatchObject({ value: true })
  })

  it('tells the caller which flag changed, on set and on clear', async () => {
    const changed: string[] = []
    const a = createFastify()
    a.register(adminFlagsApiPlugin, { db, onFlagChanged: (key: string) => changed.push(key) })
    await a.inject({ method: 'PUT', url: '/api/admin/flags/lights.enabled', headers: asAdmin, payload: { mode: 'off' } })
    await a.inject({ method: 'DELETE', url: '/api/admin/flags/lights.enabled', headers: asAdmin })
    expect(changed).toEqual(['lights.enabled', 'lights.enabled'])
  })

  it('users mode: the listed player sees it on, another player does not', async () => {
    const put = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.p121.enabled',
      headers: asAdmin,
      payload: { mode: 'users', userIds: ['player'] },
    })
    expect(put.json()).toMatchObject({ override: { mode: 'users', users: [{ id: 'player', name: 'Player' }] } })

    const ofrepPlayer = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers: asPlayer, payload: {} })
    expect(findFlag(ofrepPlayer.json(), 'gamemode.p121.enabled')).toMatchObject({ value: true })
    const ofrepOther = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers: { 'x-user': 'other' }, payload: {} })
    expect(findFlag(ofrepOther.json(), 'gamemode.p121.enabled')).toMatchObject({ value: false })
  })

  it('400s users mode without userIds', async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.p121.enabled',
      headers: asAdmin,
      payload: { mode: 'users' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('400s users mode when none of the user ids exist', async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.p121.enabled',
      headers: asAdmin,
      payload: { mode: 'users', userIds: ['nope'] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('drops user ids that no longer exist (a deleted account) and keeps the rest', async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.p121.enabled',
      headers: asAdmin,
      payload: { mode: 'users', userIds: ['gone', 'player'] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ override: { mode: 'users', users: [{ id: 'player', name: 'Player' }] } })
    const row = await db
      .selectFrom('feature_flag_overrides')
      .select('user_ids')
      .where('key', '=', 'gamemode.p121.enabled')
      .executeTakeFirstOrThrow()
    expect(row.user_ids).toEqual(['player'])
  })

  it('two saves at once on different flags both end up live', async () => {
    const a = app()
    const [p121, minigolf] = await Promise.all([
      a.inject({ method: 'PUT', url: '/api/admin/flags/gamemode.p121.enabled', headers: asAdmin, payload: { mode: 'on' } }),
      a.inject({ method: 'PUT', url: '/api/admin/flags/gamemode.minigolf.enabled', headers: asAdmin, payload: { mode: 'on' } }),
    ])
    expect([p121.statusCode, minigolf.statusCode]).toEqual([200, 200])

    const ofrep = await a.inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers: asPlayer, payload: {} })
    expect(findFlag(ofrep.json(), 'gamemode.p121.enabled')).toMatchObject({ value: true })
    expect(findFlag(ofrep.json(), 'gamemode.minigolf.enabled')).toMatchObject({ value: true })
  })

  it('saves a number flag live over OFREP, and DELETE puts it back', async () => {
    const put = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/matchmaking.visitSeconds',
      headers: asAdmin,
      payload: { number: 45 },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toMatchObject({ override: { number: 45 }, value: 45 })
    const ofrep = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers: asPlayer, payload: {} })
    expect(findFlag(ofrep.json(), 'matchmaking.visitSeconds')).toMatchObject({ value: 45 })

    const del = await app().inject({ method: 'DELETE', url: '/api/admin/flags/matchmaking.visitSeconds', headers: asAdmin })
    expect(del.statusCode).toBe(204)
    const after = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers: asPlayer, payload: {} })
    expect(findFlag(after.json(), 'matchmaking.visitSeconds')).toMatchObject({ value: 60 })
  })

  it("400s userIds on a mode other than 'users'", async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.p121.enabled',
      headers: asAdmin,
      payload: { mode: 'on', userIds: ['player'] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('400s a number out of its range', async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/matchmaking.visitSeconds',
      headers: asAdmin,
      payload: { number: 1000 },
    })
    expect(res.statusCode).toBe(400)
  })

  it("400s a body that doesn't fit the flag's kind", async () => {
    const onBoolean = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/matchmaking.visitSeconds',
      headers: asAdmin,
      payload: { mode: 'on' },
    })
    expect(onBoolean.statusCode).toBe(400)

    const onNumber = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.p121.enabled',
      headers: asAdmin,
      payload: { number: 1 },
    })
    expect(onNumber.statusCode).toBe(400)
  })

  it('404s an unknown key', async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/admin/flags/gamemode.doesNotExist.enabled',
      headers: asAdmin,
      payload: { mode: 'on' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE clears an override, back to its default', async () => {
    await app().inject({ method: 'PUT', url: '/api/admin/flags/gamemode.p121.enabled', headers: asAdmin, payload: { mode: 'on' } })
    const del = await app().inject({ method: 'DELETE', url: '/api/admin/flags/gamemode.p121.enabled', headers: asAdmin })
    expect(del.statusCode).toBe(204)

    const list = await app().inject({ method: 'GET', url: '/api/admin/flags', headers: asAdmin })
    expect(findFlag(list.json(), 'gamemode.p121.enabled')).toMatchObject({ override: null, value: true }) // admins-only default

    const ofrepPlayer = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers: asPlayer, payload: {} })
    expect(findFlag(ofrepPlayer.json(), 'gamemode.p121.enabled')).toMatchObject({ value: false })
  })

  it('a stale row (key no longer in FLAG_META) is listed under stale, and DELETE clears it too', async () => {
    await db
      .insertInto('feature_flag_overrides')
      .values({ key: 'gamemode.longGone.enabled', mode: 'on', user_ids: [], updated_by: 'admin' })
      .execute()

    const list = await app().inject({ method: 'GET', url: '/api/admin/flags', headers: asAdmin })
    expect(list.json().stale).toEqual([{ key: 'gamemode.longGone.enabled', updatedAt: expect.any(String) }])

    const del = await app().inject({ method: 'DELETE', url: '/api/admin/flags/gamemode.longGone.enabled', headers: asAdmin })
    expect(del.statusCode).toBe(204)

    const after = await app().inject({ method: 'GET', url: '/api/admin/flags', headers: asAdmin })
    expect(after.json().stale).toEqual([])
  })
})
