import '../test/authByHeader.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { setParticipants } from '../db/tournamentParticipants.js'
import { setupFlags } from '../flags/index.js'
import { createFastify } from '../api/fastify.js'
import { tournamentsApiPlugin } from '../api/tournaments.js'
import { tournamentDevicesApiPlugin } from '../api/tournamentDevices.js'
import { SessionEngine, createEngineStore } from '../session/engine.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { TournamentService } from './service.js'

// The organizer page's Start tournament through the real runner: what an in-person start answers and leaves behind
describe.skipIf(!process.env.TEST_DATABASE_URL)('starting an in-person tournament from the organizer page', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let app: FastifyInstance
  let service: TournamentService

  const settings = (groups: { size: 3 | 4 | 5; through: 1 | 2 } | null) =>
    JSON.stringify({
      seeding: 'random',
      firstTo: 2,
      longerFinal: null,
      groups,
      registrationClosesMinutes: null,
      checkInMinutes: null,
      // The start time an in-person tournament shows: only a plan, the organizer starts it
      plannedFor: new Date(Date.now() + 3_600_000).toISOString(),
      manualScoring: true,
      noShowMinutes: null,
      avgLimit: null,
      guests: null,
    })
  async function venue(id: string, players: string[], groups: { size: 3 | 4 | 5; through: 1 | 2 } | null = null) {
    await insertTournament(db, {
      id,
      owner_user_id: 'org',
      status: 'open',
      play: 'in_person',
      preselected: true,
      format: groups ? 'groups_knockout' : 'single_elimination',
      game_config: JSON.stringify({ startScore: 301 }),
      settings: settings(groups),
    })
    await setParticipants(
      db,
      id,
      players.map(name => ({ name, tag: null, color: null, players: [{ name }] })),
    )
  }
  const status = async (id: string) =>
    (await db.selectFrom('tournaments').select('status').where('id', '=', id).executeTakeFirstOrThrow()).status

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_in_person_start_test'))
    await insertUsers(db, [{ id: 'org', role: 'admin' }])
    await setupFlags(new Set())
    const engine = new SessionEngine(
      createEngineStore(db),
      () => {},
      () => {},
      undefined,
      e => service.onGameEnded(e),
    )
    service = new TournamentService({ db, engine, isOnline: () => false, boardOnline: () => true, send: () => {}, warn: () => {} })
    app = createFastify()
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
    app.register(tournamentsApiPlugin, {
      db,
      hub: { sendTournamentRequest: () => {} },
      lobbies: { pushMe: () => Promise.resolve() },
      tournaments: service,
    })
    app.register(tournamentDevicesApiPlugin, { db })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
    await close()
  })

  const send = (method: 'GET' | 'POST', url: string) => app.inject({ method, url, headers: { 'x-user': 'org' } })

  it('starts with a planned time without an error, once, and still takes devices', async () => {
    await venue('cup', ['Anna', 'Jonas', 'Mia', 'Paul'])
    const start = await send('POST', '/api/tournaments/cup/start')
    expect(start.statusCode).toBe(200)
    expect(start.json()).toMatchObject({ status: 'running' })
    // A second click (a retry, another organizer) is refused and changes nothing
    expect((await send('POST', '/api/tournaments/cup/start')).statusCode).toBe(409)
    expect(await status('cup')).toBe('running')
    expect((await send('POST', '/api/tournaments/cup/devices')).statusCode).toBe(201)
  })

  it('refuses a field its format cannot draw, says why, and leaves the tournament open', async () => {
    // Groups of 4 with one going through: two players make one group and no knockout
    await venue('groups', ['Anna', 'Jonas'], { size: 4, through: 1 })
    const participants = (await send('GET', '/api/tournaments/groups/participants')).json<{ startBlocker: string | null }>()
    expect(participants.startBlocker).toBe('Add at least 5 players before you can start.')
    const start = await send('POST', '/api/tournaments/groups/start')
    expect(start.statusCode).toBe(409)
    expect(start.json()).toEqual({ error: 'Add at least 5 players before you can start.' })
    expect(await status('groups')).toBe('open')
    expect((await send('POST', '/api/tournaments/groups/devices')).statusCode).toBe(201)
  })

  it('checks the format against who registered when players sign up themselves', async () => {
    await insertTournament(db, {
      id: 'open-door',
      owner_user_id: 'org',
      status: 'open',
      play: 'in_person',
      format: 'groups_knockout',
      settings: settings({ size: 4, through: 1 }),
    })
    for (const id of ['r1', 'r2']) await insertTournamentEntry(db, { id, tournament_id: 'open-door', status: 'registered' })
    // A team still waiting for its players doesn't play: the start releases it
    await insertTournamentEntry(db, { id: 'r3', tournament_id: 'open-door', status: 'pending' })
    const start = await send('POST', '/api/tournaments/open-door/start')
    expect(start.statusCode).toBe(409)
    expect(start.json()).toEqual({ error: 'Add at least 5 players before you can start.' })
    expect(await status('open-door')).toBe('open')
  })

  it('starts an in-person tournament whenever the organizer wants: a time on it never gates nor starts it', async () => {
    await venue('late', ['Anna', 'Jonas', 'Mia', 'Paul'])
    // Even a stored start time that has passed: the runner leaves an in-person tournament to its organizers
    await db
      .updateTable('tournaments')
      .set({ starts_at: new Date(Date.now() - 60_000) })
      .where('id', '=', 'late')
      .execute()
    await service.tick()
    expect(await status('late')).toBe('open')
    const start = await send('POST', '/api/tournaments/late/start')
    expect(start.statusCode).toBe(200)
    expect(start.json()).toMatchObject({ status: 'running' })
  })

  it('cancels a scheduled online start its format cannot draw: nobody is there to fix the list', async () => {
    await insertTournament(db, { id: 'empty', owner_user_id: 'org', status: 'open', starts_at: new Date(Date.now() - 60_000) })
    await insertTournamentEntry(db, { id: 'only', tournament_id: 'empty', status: 'registered' })
    await service.tick()
    expect(await status('empty')).toBe('cancelled')
  })

  it('never cancels an in-person tournament the organizer starts, even past the API check', async () => {
    await venue('race', ['Anna', 'Jonas'], { size: 4, through: 1 })
    expect(await service.organizerStart('race')).toBe('undrawable')
    expect(await status('race')).toBe('open')
  })
})
