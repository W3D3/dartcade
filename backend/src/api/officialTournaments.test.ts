import '../test/authByHeader.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { finishWithPlaces } from '../db/tournamentRun.js'
import { getProgress, unlockedPerks } from '../db/progression.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { setupFlags } from '../flags/index.js'
import { createFastify } from './fastify.js'
import { tournamentsApiPlugin } from './tournaments.js'

const SETTINGS = {
  seeding: 'random',
  firstTo: 3,
  longerFinal: null,
  groups: null,
  registrationClosesMinutes: null,
  checkInMinutes: 5,
  plannedFor: null,
  manualScoring: false,
  noShowMinutes: 5,
  avgLimit: null,
}
const WEEKLY = {
  tournament: {
    name: 'Weekly Open',
    description: '',
    play: 'in_person',
    preselected: true,
    visibility: 'friends',
    gameId: 'x01',
    gameConfig: { startScore: 501 },
    format: 'single_elimination',
    teamSize: 1,
    maxEntries: 8,
    startsAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    settings: { ...SETTINGS, registrationClosesMinutes: 15, checkInMinutes: 15 },
  },
  tags: ['weekly'],
  prizes: [
    { from: 1, to: 1, xp: 2000, title: 'title.weekly-champion' },
    { from: 2, to: 2, xp: 1000, title: null },
    { from: 3, to: 4, xp: 500, title: null },
  ],
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('official tournaments', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('official_tournaments_test'))
    await insertUsers(db, [{ id: 'admin', role: 'admin' }, 'amy', 'ben', 'cy'])
    await setupFlags(new Set(['tournaments.enabled']))
  })
  afterAll(async () => close())

  const post = (user: string, payload: object) => {
    const app = createFastify()
    app.register(tournamentsApiPlugin, {
      db,
      hub: { sendTournamentRequest: () => {} },
      lobbies: { pushMe: () => Promise.resolve() },
      tournaments: { organizerStart: () => Promise.resolve('started' as const), withdrawn: () => Promise.resolve() },
    })
    return app.inject({ method: 'POST', url: '/api/tournaments/official', payload, headers: { 'x-user': user } })
  }

  it('lets only admins make one, public and online with a ten minute no-show wait', async () => {
    expect((await post('amy', WEEKLY)).statusCode).toBe(403)
    const res = await post('admin', WEEKLY)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      kind: 'official',
      tags: ['weekly'],
      play: 'online',
      preselected: false,
      visibility: 'public',
      settings: { noShowMinutes: 10 },
      prizes: WEEKLY.prizes,
    })
  })

  it('refuses overlapping prizes and a title that is not one', async () => {
    const overlap = {
      ...WEEKLY,
      prizes: [
        { from: 1, to: 2, xp: 1, title: null },
        { from: 2, to: 3, xp: 1, title: null },
      ],
    }
    expect((await post('admin', overlap)).statusCode).toBe(400)
    const notTitle = { ...WEEKLY, prizes: [{ from: 1, to: 1, xp: 1, title: 'banner.gold' }] }
    expect((await post('admin', notTitle)).statusCode).toBe(400)
  })

  it('pays each place once, gives the winner the title, and pays nothing twice', async () => {
    const places = new Map<string, number>()
    await insertTournament(db, {
      id: 'weekly',
      owner_user_id: 'admin',
      kind: 'official',
      status: 'running',
      prizes: JSON.stringify(WEEKLY.prizes),
      tags: ['weekly'],
    })
    for (const [i, user] of ['amy', 'ben', 'cy'].entries()) {
      const entry = `e-${user}`
      await insertTournamentEntry(db, { id: entry, tournament_id: 'weekly', name: user })
      await db
        .insertInto('tournament_players')
        .values({ id: `p-${user}`, tournament_id: 'weekly', entry_id: entry, user_id: user, name: user, position: 1 })
        .execute()
      places.set(entry, i + 1 + (i === 2 ? 1 : 0))
    }
    const at = new Date()
    expect(await finishWithPlaces(db, 'weekly', places, at)).toBe(true)
    expect(await getProgress(db, 'amy')).toEqual({ xp: 2000 })
    expect(await getProgress(db, 'ben')).toEqual({ xp: 1000 })
    expect(await getProgress(db, 'cy')).toEqual({ xp: 500 })
    expect(await unlockedPerks(db, 'amy')).toContain('title.weekly-champion')
    expect(await unlockedPerks(db, 'ben')).not.toContain('title.weekly-champion')

    // A second finish does not move: nothing is paid again
    expect(await finishWithPlaces(db, 'weekly', places, at)).toBe(false)
    expect(await getProgress(db, 'amy')).toEqual({ xp: 2000 })
  })

  it('pays a community tournament nothing', async () => {
    await insertTournament(db, { id: 'club', owner_user_id: 'admin', status: 'running', prizes: JSON.stringify(WEEKLY.prizes) })
    await insertTournamentEntry(db, { id: 'e-club', tournament_id: 'club', name: 'zed' })
    await db
      .insertInto('tournament_players')
      .values({ id: 'p-club', tournament_id: 'club', entry_id: 'e-club', user_id: 'ben', name: 'ben', position: 1 })
      .execute()
    await finishWithPlaces(db, 'club', new Map([['e-club', 1]]), new Date())
    expect(await getProgress(db, 'ben')).toEqual({ xp: 1000 })
  })
})
