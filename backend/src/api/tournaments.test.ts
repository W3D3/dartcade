import '../test/authByHeader.js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import type { components } from '../schema/api.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { setOverrides, setupFlags } from '../flags/index.js'
import { createFastify } from './fastify.js'
import { tournamentsApiPlugin } from './tournaments.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('tournaments API', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournaments_api_test'))
    await insertUsers(db, [{ id: 'admin', role: 'admin' }, { id: 'mod', role: 'moderator' }, 'player', 'friend', 'cohost'])
    await setupFlags(new Set())
    await insertTournament(db, { id: 'weekly', status: 'open', starts_at: new Date('2026-11-16T18:00:00Z'), name: 'Weekly Open' })
    await insertTournamentEntry(db, { id: 'e1', tournament_id: 'weekly' })
    await insertTournament(db, { id: 'draft', name: 'Not yet' })
  })
  afterEach(() => setOverrides(new Map()))
  afterAll(async () => close())

  const send = (user: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => {
    const app = createFastify()
    app.register(tournamentsApiPlugin, { db })
    return app.inject({ method, url, payload, headers: { 'x-user': user } })
  }
  const get = (user: string, url = '/api/tournaments') => send(user, 'GET', url)

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

  describe('create, edit and publish', () => {
    type Input = components['schemas']['TournamentInput']
    const input: Input = {
      name: '  Pub Pairs Showdown ',
      description: 'Bring your partner!',
      access: 'public',
      gameId: 'x01',
      gameConfig: { startScore: 301, outMode: 'double' },
      format: 'single_elimination',
      teamSize: 2,
      maxEntries: 16,
      startsAt: '2030-11-23T15:00:00.000Z',
      settings: {
        seeding: 'rating',
        firstTo: 3,
        longerFinal: { firstTo: 5, semis: false },
        groups: null,
        registrationClosesMinutes: 60,
        checkInMinutes: 30,
        plannedFor: null,
        manualScoring: false,
        noShowMinutes: 10,
      },
    }
    const create = (user: string, body: object = input) => send(user, 'POST', '/api/tournaments', body)
    const created = async (user = 'admin', body: object = input) => {
      const res = await create(user, body)
      expect(res.statusCode).toBe(201)
      return res.json<components['schemas']['Tournament']>()
    }
    const problems = (res: { json: () => unknown }) => (res.json() as { details: { path: string }[] }).details.map(d => d.path)
    const on = (key: 'tournaments.enabled' | 'tournaments.community.enabled', userIds: string[]) =>
      [key, { mode: 'users', userIds }] as const

    afterEach(async () => {
      await db.deleteFrom('tournaments').where('id', 'not in', ['weekly', 'draft']).execute()
    })

    it('creates a draft the caller owns, with its texts trimmed', async () => {
      const t = await created()
      expect(t).toMatchObject({
        name: 'Pub Pairs Showdown',
        kind: 'community',
        status: 'draft',
        role: 'owner',
        owner: { id: 'admin' },
        locked: false,
        entries: 0,
        publishedAt: null,
        startsAt: '2030-11-23T15:00:00.000Z',
        gameConfig: input.gameConfig,
        settings: input.settings,
      })
    })

    it('lets only those tournaments.community.enabled is on for create one, and admins always', async () => {
      await setOverrides(new Map([on('tournaments.enabled', ['player', 'mod'])]))
      expect((await create('player')).statusCode).toBe(403)
      // Moderators may by default
      expect((await create('mod')).statusCode).toBe(201)
      await setOverrides(new Map([on('tournaments.enabled', ['player']), on('tournaments.community.enabled', ['player'])]))
      expect((await create('player')).statusCode).toBe(201)
      await setOverrides(new Map([['tournaments.community.enabled', { mode: 'off', userIds: [] }]]))
      expect((await create('admin')).statusCode).toBe(201)
    })

    it('answers 404 to create while tournaments.enabled is off', async () => {
      await setOverrides(new Map([on('tournaments.community.enabled', ['player'])]))
      expect((await create('player')).statusCode).toBe(404)
      // Before the body is checked: a bad request does not give the API away
      expect((await create('player', { name: 1 })).statusCode).toBe(404)
    })

    it("checks the game's options with the game", async () => {
      const bad = (gameConfig: object, gameId = 'x01') => create('admin', { ...input, gameId, gameConfig })
      expect(problems(await bad({ startScore: 500 }))).toEqual(['body/gameConfig'])
      expect(problems(await bad({ outMode: 'triple' }))).toEqual(['body/gameConfig'])
      // The tournament decides the match length and the teams
      expect(problems(await bad({ firstTo: 9 }))).toEqual(['body/gameConfig'])
      expect(problems(await bad({ format: 'teams' }))).toEqual(['body/gameConfig'])
      expect(problems(await bad({ nonsense: 1 }))).toEqual(['body/gameConfig'])
      expect(problems(await bad({ mode: 'sideways' }, 'cricket'))).toEqual(['body/gameConfig'])
      expect((await bad({ mode: 'cutthroat' }, 'cricket')).statusCode).toBe(201)
      // Only X01 and Cricket in brackets for now
      expect((await bad({}, 'atc')).statusCode).toBe(400)
    })

    it('refuses a setup the rules do not allow, naming every problem', async () => {
      const res = await create('admin', { ...input, name: 'ab', format: 'round_robin', maxEntries: 32, startsAt: null })
      expect(res.statusCode).toBe(400)
      expect(problems(res)).toEqual([
        'body/name',
        'body/maxEntries',
        'body/settings/longerFinal',
        'body/startsAt',
        'body/settings/registrationClosesMinutes',
        'body/settings/checkInMinutes',
      ])
    })

    it('refuses a start whose registration has already closed', async () => {
      const soon = new Date(Date.now() + 30 * 60_000).toISOString()
      const res = await create('admin', { ...input, startsAt: soon })
      expect(problems(res)).toEqual(['body/startsAt'])
    })

    it('caps an owner at 5 tournaments that are not finished or cancelled', async () => {
      const ids = []
      for (let i = 0; i < 5; i++) ids.push((await created()).id)
      const res = await create('admin')
      expect(res.statusCode).toBe(409)
      expect(res.json()).toMatchObject({ error: 'limit reached' })
      await db.updateTable('tournaments').set({ status: 'cancelled' }).where('id', '=', ids[0]).execute()
      expect((await create('admin')).statusCode).toBe(201)
    })

    it('hides a draft from everyone but its organizers', async () => {
      await setOverrides(new Map([on('tournaments.enabled', ['admin', 'player', 'cohost'])]))
      const t = await created()
      await db.insertInto('tournament_organizers').values({ tournament_id: t.id, user_id: 'cohost' }).execute()
      expect((await get('player', `/api/tournaments/${t.id}`)).statusCode).toBe(404)
      expect((await send('player', 'PATCH', `/api/tournaments/${t.id}`, { description: 'x' })).statusCode).toBe(404)
      expect((await get('player', '/api/tournaments/mine')).json()).toEqual({ tournaments: [] })
      expect((await get('player')).json().tournaments.map((x: { id: string }) => x.id)).not.toContain(t.id)
      expect((await get('cohost', `/api/tournaments/${t.id}`)).json()).toMatchObject({ role: 'organizer' })
      expect((await get('cohost', '/api/tournaments/mine')).json().tournaments).toMatchObject([{ id: t.id, role: 'organizer' }])
      expect((await get('admin', '/api/tournaments/mine')).json().tournaments).toMatchObject([{ id: t.id, role: 'owner' }])
    })

    it("shows a friends-only tournament to the owner's friends only", async () => {
      await setOverrides(new Map([on('tournaments.enabled', ['admin', 'player', 'friend'])]))
      await db.insertInto('friendships').values({ id: 'fr', requester_id: 'admin', addressee_id: 'friend', status: 'accepted' }).execute()
      const t = await created('admin', { ...input, access: 'friends' })
      expect((await send('admin', 'POST', `/api/tournaments/${t.id}/publish`)).statusCode).toBe(200)
      expect((await get('friend', `/api/tournaments/${t.id}`)).json()).toMatchObject({ id: t.id, role: null })
      expect((await get('player', `/api/tournaments/${t.id}`)).statusCode).toBe(404)
      await db.deleteFrom('friendships').where('id', '=', 'fr').execute()
    })

    it('publishes a draft once, opening registration', async () => {
      const t = await created()
      const res = await send('admin', 'POST', `/api/tournaments/${t.id}/publish`)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ status: 'open', publishedAt: expect.any(String) })
      expect((await send('admin', 'POST', `/api/tournaments/${t.id}/publish`)).statusCode).toBe(409)
      expect((await get('admin')).json().tournaments.map((x: { id: string }) => x.id)).toContain(t.id)
    })

    it('checks the start again on publish', async () => {
      const t = await created()
      await db
        .updateTable('tournaments')
        .set({ starts_at: new Date(Date.now() + 10 * 60_000) })
        .where('id', '=', t.id)
        .execute()
      const res = await send('admin', 'POST', `/api/tournaments/${t.id}/publish`)
      expect(res.statusCode).toBe(400)
      expect(problems(res)).toEqual(['body/startsAt'])
    })

    it('lets organizers change a tournament and answers 403 to anyone else', async () => {
      await setOverrides(new Map([on('tournaments.enabled', ['admin', 'player', 'cohost'])]))
      const t = await created()
      await db.insertInto('tournament_organizers').values({ tournament_id: t.id, user_id: 'cohost' }).execute()
      await send('admin', 'POST', `/api/tournaments/${t.id}/publish`)
      const res = await send('cohost', 'PATCH', `/api/tournaments/${t.id}`, { name: 'Pub Pairs Open', maxEntries: 32 })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ name: 'Pub Pairs Open', maxEntries: 32, description: input.description })
      for (const [method, url] of [
        ['PATCH', `/api/tournaments/${t.id}`],
        ['POST', `/api/tournaments/${t.id}/cancel`],
        ['DELETE', `/api/tournaments/${t.id}`],
      ] as const)
        expect((await send('player', method, url, method === 'PATCH' ? { name: 'Mine now' } : undefined)).statusCode).toBe(403)
    })

    it('checks a change like a new tournament', async () => {
      const t = await created()
      const res = await send('admin', 'PATCH', `/api/tournaments/${t.id}`, { format: 'groups_knockout' })
      expect(res.statusCode).toBe(400)
      expect(problems(res)).toEqual(['body/settings/groups'])
    })

    it('locks an online tournament but its start time and description once someone registered', async () => {
      const t = await created()
      await send('admin', 'POST', `/api/tournaments/${t.id}/publish`)
      await insertTournamentEntry(db, { id: 'pairs-1', tournament_id: t.id })
      expect((await get('admin', `/api/tournaments/${t.id}`)).json()).toMatchObject({ locked: true, entries: 1 })
      const res = await send('admin', 'PATCH', `/api/tournaments/${t.id}`, { name: 'Renamed', settings: { ...input.settings, firstTo: 4 } })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toMatchObject({ error: 'locked' })
      expect(problems(res)).toEqual(['body/name', 'body/settings/firstTo'])
      const moved = await send('admin', 'PATCH', `/api/tournaments/${t.id}`, {
        startsAt: '2030-11-24T18:00:00.000Z',
        description: 'Moved a day',
        settings: { ...input.settings, checkInMinutes: 15 },
      })
      expect(moved.statusCode).toBe(200)
      expect(moved.json()).toMatchObject({ startsAt: '2030-11-24T18:00:00.000Z', description: 'Moved a day' })
    })

    it('keeps an in-person tournament editable when its organizers added players', async () => {
      const t = await created('admin', {
        ...input,
        access: 'in_person',
        startsAt: null,
        settings: { ...input.settings, registrationClosesMinutes: null, checkInMinutes: null, noShowMinutes: null },
      })
      await insertTournamentEntry(db, { id: 'bar-1', tournament_id: t.id })
      const res = await send('admin', 'PATCH', `/api/tournaments/${t.id}`, { teamSize: 3 })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ teamSize: 3, locked: false })
    })

    it('cancels a published tournament and refuses to change it after', async () => {
      const t = await created()
      expect((await send('admin', 'POST', `/api/tournaments/${t.id}/cancel`)).statusCode).toBe(409)
      await send('admin', 'POST', `/api/tournaments/${t.id}/publish`)
      const res = await send('admin', 'POST', `/api/tournaments/${t.id}/cancel`)
      expect(res.json()).toMatchObject({ status: 'cancelled' })
      expect((await send('admin', 'PATCH', `/api/tournaments/${t.id}`, { description: 'x' })).statusCode).toBe(409)
      expect((await send('admin', 'POST', `/api/tournaments/${t.id}/cancel`)).statusCode).toBe(409)
    })

    it('deletes a draft only', async () => {
      const draft = await created()
      expect((await send('admin', 'DELETE', `/api/tournaments/${draft.id}`)).statusCode).toBe(204)
      expect((await get('admin', `/api/tournaments/${draft.id}`)).statusCode).toBe(404)
      const open = await created()
      await send('admin', 'POST', `/api/tournaments/${open.id}/publish`)
      expect((await send('admin', 'DELETE', `/api/tournaments/${open.id}`)).statusCode).toBe(409)
    })
  })
})
