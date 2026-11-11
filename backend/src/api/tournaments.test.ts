import '../test/authByHeader.js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { setOverrides, setupFlags } from '../flags/index.js'
import { createFastify } from './fastify.js'
import { tournamentsApiPlugin } from './tournaments.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('tournaments API', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournaments_api_test'))
    await insertUsers(db, [{ id: 'admin', role: 'admin' }, 'player'])
    await setupFlags(new Set())
    await insertTournament(db, { id: 'weekly', status: 'open', starts_at: new Date('2026-11-16T18:00:00Z'), name: 'Weekly Open' })
    await insertTournamentEntry(db, { id: 'e1', tournament_id: 'weekly' })
    await insertTournament(db, { id: 'draft', name: 'Not yet' })
  })
  afterEach(() => setOverrides(new Map()))
  afterAll(async () => close())

  const get = (user: string, url = '/api/tournaments') => {
    const app = createFastify()
    app.register(tournamentsApiPlugin, { db })
    return app.inject({ method: 'GET', url, headers: { 'x-user': user } })
  }

  it('answers 404 while the flag is off for the caller', async () => {
    const res = await get('player')
    expect(res.statusCode).toBe(404)
  })

  it('lists the published public tournaments for someone the flag is on for', async () => {
    const res = await get('admin')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      tournaments: [
        {
          id: 'weekly',
          name: 'Weekly Open',
          kind: 'community',
          access: 'public',
          status: 'open',
          gameId: 'x01',
          format: 'single_elimination',
          teamSize: 1,
          maxEntries: 8,
          entries: 1,
          startsAt: '2026-11-16T18:00:00.000Z',
        },
      ],
    })
  })

  it('answers 404 for an admin too once the flag is overridden off', async () => {
    await setOverrides(new Map([['tournaments.enabled', { mode: 'off', userIds: [] }]]))
    expect((await get('admin')).statusCode).toBe(404)
  })

  it('opens to a player the flag is turned on for', async () => {
    await setOverrides(new Map([['tournaments.enabled', { mode: 'users', userIds: ['player'] }]]))
    expect((await get('player')).statusCode).toBe(200)
  })
})
