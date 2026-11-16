import { useDbSingleton } from '../test/db.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import rateLimit from '@fastify/rate-limit'
import type { Kysely } from 'kysely'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/middleware.js'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createHash } from 'node:crypto'
import { setupFlags } from '../flags/index.js'
import { insertTournament, insertUsers } from '../test/fixtures.js'
import { createFastify } from './fastify.js'
import { tournamentsApiPlugin } from './tournaments.js'
import { tournamentDevicesApiPlugin } from './tournamentDevices.js'

// The signed-in user is the `x-user` header; the venue device's cookie goes through the real middleware
vi.mock('../auth/session.js', () => ({
  getAuthUser: (req: { headers: Record<string, string | string[] | undefined> }) => {
    const user = req.headers['x-user']
    return Promise.resolve(typeof user === 'string' ? { userId: user, impersonatedBy: null } : null)
  },
}))

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

describe.skipIf(!process.env.TEST_DATABASE_URL)('tournament device sessions', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let app: FastifyInstance

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_devices_test'))
    useDbSingleton(db)
    await insertUsers(db, [{ id: 'boss', role: 'admin' }, { id: 'helper', role: 'admin' }, 'stranger'])
    await setupFlags(new Set())
    for (const id of ['venue', 'other', 'over']) {
      await insertTournament(db, { id, owner_user_id: 'boss', access: 'in_person', status: id === 'over' ? 'running' : 'open' })
    }
    app = createFastify()
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
    app.register(tournamentsApiPlugin, {
      db,
      hub: { sendTournamentRequest: () => {} },
      lobbies: { pushMe: () => Promise.resolve() },
      tournaments: { organizerStart: () => Promise.resolve('started' as const), withdrawn: () => Promise.resolve() },
    })
    app.register(tournamentDevicesApiPlugin, { db })
    // Any other page's API: signed in, nothing about devices
    app.get('/api/anything-else', { preValidation: requireAuth }, () => ({ ok: true }))
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
    await close()
  })

  const as = (user: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { 'x-user': user } })
  const withCookie = (cookie: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie } })
  let ip = 0
  const addDevice = async (tournament = 'venue') =>
    (
      await app.inject({
        method: 'POST',
        url: `/api/tournaments/${tournament}/devices`,
        headers: { 'x-user': 'boss' },
        remoteAddress: `10.1.0.${++ip}`,
      })
    ).json<{ id: string; code: string; expiresAt: string }>()
  /** Adds a device and opens its code: the cookie the device holds. */
  async function paired(tournament = 'venue') {
    const d = await addDevice(tournament)
    // Each device comes from its own address, so the per-IP limit tested below doesn't trip
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournament-devices/pair',
      payload: { code: d.code },
      remoteAddress: `10.0.0.${++ip}`,
    })
    const cookie = String(res.headers['set-cookie']).split(';')[0]
    return { ...d, cookie, res }
  }

  it('hands out a short code once and keeps only hashes', async () => {
    const d = await addDevice()
    expect(d.code).toMatch(/^[A-Z2-9]{8}$/)
    const row = await db.selectFrom('tournament_devices').selectAll().where('id', '=', d.id).executeTakeFirstOrThrow()
    expect(row.pair_code_hash).toBe(hashToken(d.code))
    expect(JSON.stringify(row)).not.toContain(d.code)
    expect((await as('boss', 'GET', '/api/tournaments/venue/devices')).json<{ devices: object[] }>().devices.length).toBeGreaterThan(0)
  })

  it('refuses non-organizers and tournaments that are not in person or are over', async () => {
    expect((await as('stranger', 'POST', '/api/tournaments/venue/devices')).statusCode).toBe(404)
    await insertTournament(db, { id: 'online', owner_user_id: 'boss', status: 'open' })
    expect((await as('boss', 'POST', '/api/tournaments/online/devices')).statusCode).toBe(409)
    await insertTournament(db, { id: 'done', owner_user_id: 'boss', access: 'in_person', status: 'finished' })
    expect((await as('boss', 'POST', '/api/tournaments/done/devices')).statusCode).toBe(409)
  })

  it('pairing sets an httpOnly cookie holding a token that is stored hashed, and works once', async () => {
    const { code, cookie, res } = await paired()
    expect(res.statusCode).toBe(200)
    const header = String(res.headers['set-cookie'])
    expect(header).toMatch(/HttpOnly/)
    expect(header).toMatch(/SameSite=Lax/)
    const token = cookie.split('=')[1]
    const row = await db.selectFrom('tournament_devices').select('token_hash').where('token_hash', '=', hashToken(token)).executeTakeFirst()
    expect(row).toBeDefined()
    expect(JSON.stringify(await db.selectFrom('tournament_devices').selectAll().execute())).not.toContain(token)
    // A used code, a wrong code and an expired code are all the same 404
    expect((await app.inject({ method: 'POST', url: '/api/tournament-devices/pair', payload: { code } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/api/tournament-devices/pair', payload: { code: 'NOSUCHCD' } })).statusCode).toBe(404)
    const late = await addDevice()
    await db
      .updateTable('tournament_devices')
      .set({ pair_expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', late.id)
      .execute()
    expect((await app.inject({ method: 'POST', url: '/api/tournament-devices/pair', payload: { code: late.code } })).statusCode).toBe(404)
  })

  it('a device may read its own tournament (without the invite link) and name itself', async () => {
    const { cookie } = await paired()
    const t = await withCookie(cookie, 'GET', '/api/tournaments/venue')
    expect(t.statusCode).toBe(200)
    expect(t.json<{ inviteCode: string | null }>().inviteCode).toBeNull()
    expect((await withCookie(cookie, 'PATCH', '/api/tournament-device', { name: ' Tablet · Bar ' })).json()).toMatchObject({
      name: 'Tablet · Bar',
      tournamentId: 'venue',
    })
    expect((await withCookie(cookie, 'GET', '/api/tournament-device')).json()).toMatchObject({
      tournamentId: 'venue',
      name: 'Tablet · Bar',
    })
  })

  it('refuses a device everything else: other tournaments, organizer actions, every other API', async () => {
    const { cookie } = await paired()
    // Another tournament, even one the organizer owns
    expect((await withCookie(cookie, 'GET', '/api/tournaments/other')).statusCode).toBe(404)
    // Organizer actions on its own tournament: by action, not by page
    const organizerActions: [Parameters<typeof withCookie>[1], string, object?][] = [
      ['POST', '/api/tournaments/venue/start'],
      ['POST', '/api/tournaments/venue/cancel'],
      ['POST', '/api/tournaments/venue/publish'],
      ['DELETE', '/api/tournaments/venue'],
      ['PATCH', '/api/tournaments/venue', { name: 'Hijacked' }],
      ['PUT', '/api/tournaments/venue/participants', { entries: [] }],
      ['GET', '/api/tournaments/venue/participants'],
      ['GET', '/api/tournaments/venue/organizers'],
      ['POST', '/api/tournaments/venue/devices'],
      ['GET', '/api/tournaments/venue/devices'],
      ['DELETE', '/api/tournaments/venue/devices'],
    ]
    for (const [method, url, body] of organizerActions) {
      const res = await withCookie(cookie, method, url, body)
      expect([url, method, res.statusCode]).toEqual([url, method, 403])
    }
    // No other page's API
    for (const url of ['/api/anything-else', '/api/tournaments', '/api/tournaments/venue/team-options']) {
      expect([url, (await withCookie(cookie, 'GET', url)).statusCode]).toEqual([url, 403])
    }
    expect((await app.inject({ method: 'GET', url: '/api/anything-else' })).statusCode).toBe(401)
    expect((await as('boss', 'GET', '/api/anything-else')).statusCode).toBe(200)
    // Nothing changed
    const t = await db.selectFrom('tournaments').select(['name', 'status']).where('id', '=', 'venue').executeTakeFirstOrThrow()
    expect(t.status).toBe('open')
    expect(t.name).not.toBe('Hijacked')
  })

  it('an organizer revokes one device at once; the others keep working', async () => {
    const a = await paired()
    const b = await paired()
    expect((await as('boss', 'DELETE', `/api/tournaments/venue/devices/${a.id}`)).statusCode).toBe(204)
    expect((await withCookie(a.cookie, 'GET', '/api/tournaments/venue')).statusCode).toBe(401)
    expect((await withCookie(b.cookie, 'GET', '/api/tournaments/venue')).statusCode).toBe(200)
    expect((await as('boss', 'DELETE', `/api/tournaments/venue/devices/${a.id}`)).statusCode).toBe(404)
    expect((await as('boss', 'DELETE', '/api/tournaments/venue/devices')).statusCode).toBe(204)
    expect((await withCookie(b.cookie, 'GET', '/api/tournaments/venue')).statusCode).toBe(401)
    expect((await as('boss', 'GET', '/api/tournaments/venue/devices')).json<{ devices: object[] }>().devices).toEqual([])
  })

  it('the session ends with the tournament, its age or idleness', async () => {
    const ended = await paired('over')
    expect((await withCookie(ended.cookie, 'GET', '/api/tournaments/over')).statusCode).toBe(200)
    await db.updateTable('tournaments').set({ status: 'finished' }).where('id', '=', 'over').execute()
    expect((await withCookie(ended.cookie, 'GET', '/api/tournaments/over')).statusCode).toBe(401)

    const old = await paired()
    await db
      .updateTable('tournament_devices')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', old.id)
      .execute()
    expect((await withCookie(old.cookie, 'GET', '/api/tournaments/venue')).statusCode).toBe(401)
    const idle = await paired()
    await db
      .updateTable('tournament_devices')
      .set({ last_seen_at: new Date(Date.now() - 25 * 3_600_000) })
      .where('id', '=', idle.id)
      .execute()
    expect((await withCookie(idle.cookie, 'GET', '/api/tournaments/venue')).statusCode).toBe(401)
  })

  it('limits pairing attempts per IP', async () => {
    let last = 0
    for (let i = 0; i < 12; i++)
      last = (await app.inject({ method: 'POST', url: '/api/tournament-devices/pair', payload: { code: 'WRONGCOD' } })).statusCode
    expect(last).toBe(429)
  })
})
