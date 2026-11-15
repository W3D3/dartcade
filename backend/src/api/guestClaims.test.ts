import '../test/authByHeader.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { pendingClaimsFor } from '../db/guestClaims.js'
import { GuestClaimService } from '../guestClaims/service.js'
import { flagEnabled, loadFlagUser, setupFlags } from '../flags/index.js'
import { insertUsers } from '../test/fixtures.js'
import { createFastify } from './fastify.js'
import { guestClaimsApiPlugin } from './guestClaims.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('guest claims API', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let announced: { userId: string; invite: { id: string } }[]
  let refreshed: string[]
  let counted: string[]

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('guest_claims_api_test'))
    await setupFlags(new Set())
  })
  beforeEach(async () => {
    await sql`TRUNCATE "user", game_sessions CASCADE`.execute(db)
    // Admins have guestClaims.enabled by default; `stranger` and `off` do not
    await insertUsers(db, [...['host', 'lena', 'max'].map(id => ({ id, role: 'admin' })), 'stranger', 'off'])
    for (const f of ['lena', 'max'])
      await db
        .insertInto('friendships')
        .values({ id: `f-${f}`, requester_id: 'host', addressee_id: f, status: 'accepted' })
        .execute()
    announced = []
    refreshed = []
    counted = []
    await game('g1')
  })
  afterAll(async () => close())

  /** A finished 4 seat x01 game hosted by `host`: Pia and Tom are guests, seat 2 is a bot, seat 3 is host's. */
  async function game(id: string, extra: { status?: string; invalidated?: boolean; owner?: string } = {}) {
    await db
      .insertInto('game_sessions')
      .values({
        id,
        owner_user_id: extra.owner ?? 'host',
        game_id: 'x01',
        config: '{}',
        status: extra.status ?? 'finished',
        finished_at: new Date('2026-11-01T18:00:00Z'),
      })
      .execute()
    if (extra.invalidated) await sql`UPDATE game_sessions SET invalidated_at = now() WHERE id = ${id}`.execute(db)
    await db
      .insertInto('game_players')
      .values([
        { session_id: id, seat: 0, name: 'Pia', user_id: null, placement: 1, stats: '{}' },
        { session_id: id, seat: 1, name: 'Tom', user_id: null, placement: 2, stats: '{}' },
        { session_id: id, seat: 2, name: 'Bot', user_id: null, placement: 3, stats: '{}', bot_level: 5 },
        { session_id: id, seat: 3, name: 'Host', user_id: 'host', placement: 4, stats: '{}' },
      ])
      .execute()
    await db.insertInto('game_details').values({ session_id: id, version: 'v', detail: '{}', stats: '{}' }).execute()
    await db.insertInto('coach_games').values({ game_id: id, version: 1 }).execute()
  }

  const call = (user: string, method: 'GET' | 'PUT' | 'DELETE' | 'POST', url: string, payload?: object) => {
    const app = createFastify()
    const guestClaims = new GuestClaimService({
      db,
      announce: (userId, invite) => {
        announced.push({ userId, invite })
        return Promise.resolve()
      },
      refresh: userIds => {
        refreshed.push(...userIds)
        return Promise.resolve()
      },
      countGame: id => {
        counted.push(id)
        return Promise.resolve()
      },
      available: async userId => flagEnabled('guestClaims.enabled', await loadFlagUser(db, userId)),
      warn: () => {},
    })
    app.register(guestClaimsApiPlugin, { db, guestClaims })
    return app.inject({ method, url, payload, headers: { 'x-user': user } })
  }
  const view = async (user: string, id = 'g1') =>
    (await call(user, 'GET', `/api/games/${id}/guest-claims`)).json<{ canClaim: boolean; seats: any[] }>()
  const invite = (user: string, friend: string, seat = 0, id = 'g1') =>
    call(user, 'PUT', `/api/games/${id}/guest-claims/${seat}`, { userId: friend })
  const inviteIdOf = async (seat = 0) => (await view('host')).seats.find(s => s.seat === seat).invite.id as string
  const seatUser = async (seat: number, id = 'g1') =>
    (await db.selectFrom('game_players').select('user_id').where('session_id', '=', id).where('seat', '=', seat).executeTakeFirstOrThrow())
      .user_id

  it('shows the host the guest seats only, nobody else, and nothing for a game that cannot be claimed', async () => {
    const v = await view('host')
    expect(v.canClaim).toBe(true)
    expect(v.seats).toEqual([
      { seat: 0, name: 'Pia', placement: 1, invite: null },
      { seat: 1, name: 'Tom', placement: 2, invite: null },
    ])
    expect(await view('lena')).toEqual({ canClaim: false, seats: [] })
    await game('running', { status: 'active' })
    await game('voided', { invalidated: true })
    await game('theirs', { owner: 'stranger' })
    for (const id of ['running', 'voided', 'theirs']) expect(await view('host', id)).toEqual({ canClaim: false, seats: [] })
  })

  it('asks a friend, tells them, and changes nothing about the game until they accept', async () => {
    const res = await invite('host', 'lena')
    expect(res.statusCode).toBe(200)
    expect(res.json().seats[0].invite).toMatchObject({ user: { id: 'lena', name: 'lena' } })
    expect(announced.map(a => a.userId)).toEqual(['lena'])
    const [pending] = await pendingClaimsFor(db, 'lena')
    expect(pending).toMatchObject({ gameId: 'g1', mode: 'x01', seatName: 'Pia', placement: 1, host: { id: 'host' } })
    expect(await seatUser(0)).toBeNull()
    expect(await db.selectFrom('game_details').select('session_id').execute()).toHaveLength(1)
    expect(counted).toEqual([])
  })

  it('is absent for a caller without the flag, and a friend without it cannot be asked', async () => {
    expect((await call('off', 'GET', '/api/games/g1/guest-claims')).statusCode).toBe(404)
    expect((await call('off', 'POST', '/api/guest-claims/x/accept')).statusCode).toBe(404)
    await db.insertInto('friendships').values({ id: 'f-off', requester_id: 'host', addressee_id: 'off', status: 'accepted' }).execute()
    expect((await invite('host', 'off')).json()).toMatchObject({ code: 'unavailable' })
  })

  it('refuses everyone but the host, non-friends, seated players, non-guest seats and unfinished games', async () => {
    expect((await invite('lena', 'max')).statusCode).toBe(404)
    expect((await invite('host', 'stranger')).json()).toMatchObject({ code: 'not_friend' })
    expect((await invite('host', 'host')).json()).toMatchObject({ code: 'not_friend' })
    expect((await invite('host', 'lena', 2)).json()).toMatchObject({ code: 'not_guest' })
    expect((await invite('host', 'lena', 3)).json()).toMatchObject({ code: 'not_guest' })
    await game('running', { status: 'active' })
    expect((await invite('host', 'lena', 0, 'running')).json()).toMatchObject({ code: 'not_claimable' })
    await db.updateTable('game_players').set({ user_id: 'max' }).where('session_id', '=', 'g1').where('seat', '=', 1).execute()
    expect((await invite('host', 'max')).json()).toMatchObject({ code: 'already_seated' })
  })

  it('asks a friend for one seat of a game at a time and a seat of one friend at a time', async () => {
    expect((await invite('host', 'lena', 0)).statusCode).toBe(200)
    expect((await invite('host', 'lena', 1)).json()).toMatchObject({ code: 'already_invited' })
    // Changing the friend for a seat takes the first invite back
    expect((await invite('host', 'max', 0)).statusCode).toBe(200)
    expect(await pendingClaimsFor(db, 'lena')).toEqual([])
    expect(await pendingClaimsFor(db, 'max')).toHaveLength(1)
    expect((await invite('host', 'lena', 1)).statusCode).toBe(200)
  })

  it('lets the host cancel, and only the host', async () => {
    await invite('host', 'lena')
    expect((await call('lena', 'DELETE', '/api/games/g1/guest-claims/0')).statusCode).toBe(403)
    expect((await call('host', 'DELETE', '/api/games/g1/guest-claims/0')).statusCode).toBe(204)
    expect((await call('host', 'DELETE', '/api/games/g1/guest-claims/0')).statusCode).toBe(404)
    expect(await pendingClaimsFor(db, 'lena')).toEqual([])
    expect((await view('host')).seats[0].invite).toBeNull()
  })

  it('lets the friend decline, and the host ask again', async () => {
    await invite('host', 'lena')
    const id = await inviteIdOf()
    expect((await call('max', 'POST', `/api/guest-claims/${id}/decline`)).statusCode).toBe(404)
    expect((await call('lena', 'POST', `/api/guest-claims/${id}/decline`)).statusCode).toBe(204)
    expect(await seatUser(0)).toBeNull()
    expect((await call('lena', 'POST', `/api/guest-claims/${id}/accept`)).statusCode).toBe(404)
    expect((await invite('host', 'lena')).statusCode).toBe(200)
  })

  it('hands the seat over on accept: the game is the friend’s, rebuilt, counted once, no longer a guest', async () => {
    await invite('host', 'lena')
    const id = await inviteIdOf()
    expect((await call('max', 'POST', `/api/guest-claims/${id}/accept`)).statusCode).toBe(404)
    expect((await call('lena', 'POST', `/api/guest-claims/${id}/accept`)).statusCode).toBe(204)
    expect(await seatUser(0)).toBe('lena')
    expect(await db.selectFrom('game_details').select('session_id').execute()).toEqual([])
    expect(await db.selectFrom('coach_games').select('game_id').execute()).toEqual([])
    expect(counted).toEqual(['g1'])
    expect((await view('host')).seats.map(s => s.seat)).toEqual([1])
    expect((await call('lena', 'POST', `/api/guest-claims/${id}/accept`)).statusCode).toBe(404)
    expect(counted).toEqual(['g1'])
    expect(refreshed).toContain('host')
  })

  it('cannot be accepted once the game is invalidated, and the game then lists no invite', async () => {
    await invite('host', 'lena')
    const id = await inviteIdOf()
    await sql`UPDATE game_sessions SET invalidated_at = now() WHERE id = 'g1'`.execute(db)
    expect(await pendingClaimsFor(db, 'lena')).toEqual([])
    expect((await call('lena', 'POST', `/api/guest-claims/${id}/accept`)).json()).toMatchObject({ code: 'not_claimable' })
    expect(await seatUser(0)).toBeNull()
  })

  it('drops pending invites with either account', async () => {
    await invite('host', 'lena', 0)
    await invite('host', 'max', 1)
    await db.deleteFrom('user').where('id', '=', 'lena').execute()
    expect(await db.selectFrom('game_guest_claims').select('invited_user_id').execute()).toEqual([{ invited_user_id: 'max' }])
    await db.deleteFrom('user').where('id', '=', 'host').execute()
    expect(await db.selectFrom('game_guest_claims').select('id').execute()).toEqual([])
  })
})
