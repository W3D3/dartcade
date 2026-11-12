import '../test/authByHeader.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import type { components } from '../schema/api.js'
import { insertTournament, insertUsers } from '../test/fixtures.js'
import { setOverrides, setupFlags } from '../flags/index.js'
import { createFastify } from './fastify.js'
import { tournamentsApiPlugin } from './tournaments.js'

type MyTournaments = components['schemas']['MyTournaments']
type Organizers = components['schemas']['TournamentOrganizers']

/** A setup that passes the create and publish checks. */
const valid = {
  game_config: '{}',
  starts_at: new Date('2030-01-01T10:00:00Z'),
  settings: JSON.stringify({
    seeding: 'random',
    firstTo: 3,
    longerFinal: null,
    groups: null,
    registrationClosesMinutes: 60,
    checkInMinutes: 30,
    plannedFor: null,
    manualScoring: false,
    noShowMinutes: 10,
    avgLimit: null,
  }),
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('tournament organizers API', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const sendTournamentRequest = vi.fn()

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_organizers_api_test'))
    await insertUsers(db, [
      { id: 'owner', name: 'Chris' },
      { id: 'lena', name: 'Lena' },
      { id: 'max', name: 'Max' },
      { id: 'stranger', name: 'Stranger' },
    ])
    await setupFlags(new Set())
    await setOverrides(new Map([['tournaments.enabled', { mode: 'on', userIds: [] }]]))
  })
  beforeEach(async () => {
    sendTournamentRequest.mockClear()
    await db.deleteFrom('tournaments').execute()
    await insertTournament(db, { id: 't1', owner_user_id: 'owner', status: 'open', name: 'Club Night', ...valid })
    await db.insertInto('tournament_organizers').values({ tournament_id: 't1', user_id: 'lena' }).execute()
  })
  afterAll(async () => close())

  const send = (user: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => {
    const app = createFastify()
    app.register(tournamentsApiPlugin, {
      db,
      hub: { sendTournamentRequest },
      lobbies: { pushMe: () => Promise.resolve() },
      tournaments: {} as any,
    })
    return app.inject({ method, url, payload, headers: { 'x-user': user } })
  }

  it('lists the owner first, then the organizers', async () => {
    const res = await send('lena', 'GET', '/api/tournaments/t1/organizers')
    expect(res.statusCode).toBe(200)
    expect(res.json<Organizers>().organizers).toMatchObject([
      { id: 'owner', name: 'Chris', role: 'owner', addedAt: null },
      { id: 'lena', name: 'Lena', role: 'organizer' },
    ])
  })

  it('lets an organizer edit, cancel and delete-draft like the owner', async () => {
    expect((await send('lena', 'PATCH', '/api/tournaments/t1', { description: 'Bring darts' })).statusCode).toBe(200)
    expect((await send('stranger', 'PATCH', '/api/tournaments/t1', { description: 'x' })).statusCode).toBe(403)
    await insertTournament(db, { id: 'd1', owner_user_id: 'owner' })
    await db.insertInto('tournament_organizers').values({ tournament_id: 'd1', user_id: 'lena' }).execute()
    expect((await send('lena', 'DELETE', '/api/tournaments/d1')).statusCode).toBe(204)
    expect((await send('lena', 'POST', '/api/tournaments/t1/cancel')).statusCode).toBe(200)
  })

  it('lets an organizer publish a draft', async () => {
    await insertTournament(db, { id: 'd2', owner_user_id: 'owner', ...valid })
    await db.insertInto('tournament_organizers').values({ tournament_id: 'd2', user_id: 'lena' }).execute()
    expect((await send('lena', 'POST', '/api/tournaments/d2/publish')).statusCode).toBe(200)
  })

  it('lets only the owner add an organizer, and pushes tournament.request to them', async () => {
    const res = await send('owner', 'POST', '/api/tournaments/t1/organizers', { userId: 'max' })
    expect(res.statusCode).toBe(201)
    expect(res.json<Organizers>().organizers.map(o => o.id)).toEqual(['owner', 'lena', 'max'])
    expect(sendTournamentRequest).toHaveBeenCalledWith('max', {
      type: 'tournament.request',
      tournamentId: 't1',
      tournamentName: 'Club Night',
      role: 'organizer',
      from: { id: 'owner', name: 'Chris' },
    })
    sendTournamentRequest.mockClear()
    expect((await send('lena', 'POST', '/api/tournaments/t1/organizers', { userId: 'stranger' })).statusCode).toBe(403)
    expect((await send('stranger', 'POST', '/api/tournaments/t1/organizers', { userId: 'stranger' })).statusCode).toBe(403)
    expect(sendTournamentRequest).not.toHaveBeenCalled()
  })

  it('refuses an organizer who already is one, the owner, and an unknown account', async () => {
    expect((await send('owner', 'POST', '/api/tournaments/t1/organizers', { userId: 'lena' })).statusCode).toBe(409)
    expect((await send('owner', 'POST', '/api/tournaments/t1/organizers', { userId: 'owner' })).statusCode).toBe(409)
    expect((await send('owner', 'POST', '/api/tournaments/t1/organizers', { userId: 'nobody' })).statusCode).toBe(404)
    expect(sendTournamentRequest).not.toHaveBeenCalled()
  })

  it('caps the co-organizers at ten', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `x${i}`)
    await insertUsers(db, ids)
    await db
      .insertInto('tournament_organizers')
      .values(ids.slice(2).map(user_id => ({ tournament_id: 't1', user_id })))
      .execute()
    // lena + eight: x1 is the tenth, max would be the eleventh
    expect((await send('owner', 'POST', '/api/tournaments/t1/organizers', { userId: 'x1' })).statusCode).toBe(201)
    expect((await send('owner', 'POST', '/api/tournaments/t1/organizers', { userId: 'max' })).statusCode).toBe(409)
    // Two at once at nine: one gets in, the other finds it full
    await db.deleteFrom('tournament_organizers').where('tournament_id', '=', 't1').where('user_id', '=', 'x1').execute()
    const racing = await Promise.all(['max', 'stranger'].map(userId => send('owner', 'POST', '/api/tournaments/t1/organizers', { userId })))
    expect(racing.map(r => r.statusCode).sort()).toEqual([201, 409])
  })

  it('lets only the owner remove someone else', async () => {
    await db.insertInto('tournament_organizers').values({ tournament_id: 't1', user_id: 'max' }).execute()
    expect((await send('lena', 'DELETE', '/api/tournaments/t1/organizers/max')).statusCode).toBe(403)
    expect((await send('owner', 'DELETE', '/api/tournaments/t1/organizers/max')).statusCode).toBe(204)
    expect((await send('owner', 'DELETE', '/api/tournaments/t1/organizers/max')).statusCode).toBe(404)
  })

  it('lets an organizer leave, after which the tournament is not theirs any more', async () => {
    const mine = async () => (await send('lena', 'GET', '/api/tournaments/mine')).json<MyTournaments>().organizing
    expect((await mine()).map(o => [o.tournament.id, o.role])).toEqual([['t1', 'organizer']])
    expect((await send('lena', 'DELETE', '/api/tournaments/t1/organizers/lena')).statusCode).toBe(204)
    expect(await mine()).toEqual([])
    expect((await send('lena', 'PATCH', '/api/tournaments/t1', { description: 'x' })).statusCode).toBe(403)
  })

  it('keeps the owner in place', async () => {
    expect((await send('owner', 'DELETE', '/api/tournaments/t1/organizers/owner')).statusCode).toBe(409)
  })

  it('shows a new organizer the tournament under Organizing', async () => {
    await send('owner', 'POST', '/api/tournaments/t1/organizers', { userId: 'max' })
    const res = await send('max', 'GET', '/api/tournaments/mine')
    expect(res.json<MyTournaments>().organizing.map(o => [o.tournament.id, o.role])).toEqual([['t1', 'organizer']])
  })

  it('hides organizers of a draft from people who are not organizers', async () => {
    await insertTournament(db, { id: 'd3', owner_user_id: 'owner' })
    expect((await send('stranger', 'GET', '/api/tournaments/d3/organizers')).statusCode).toBe(404)
  })
})
