import '../test/authByHeader.js'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import type { components } from '../schema/api.js'
import { insertBoard, insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
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
    await insertTournament(db, { id: 'weekly', status: 'open', starts_at: new Date('2030-11-16T18:00:00Z'), name: 'Weekly Open' })
    await insertTournamentEntry(db, { id: 'e1', tournament_id: 'weekly' })
    await insertTournament(db, { id: 'draft', name: 'Not yet' })
  })
  afterEach(() => setOverrides(new Map()))
  afterAll(async () => close())

  const tournaments = {
    organizerStart: vi.fn(() => Promise.resolve('started' as const)),
    withdrawn: vi.fn(() => Promise.resolve()),
  }
  const send = (user: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => {
    const app = createFastify()
    app.register(tournamentsApiPlugin, {
      db,
      hub: { sendTournamentRequest: () => {} },
      lobbies: { pushMe: () => Promise.resolve() },
      tournaments,
    })
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
          gameConfig: { start: 501 },
          format: 'single_elimination',
          teamSize: 1,
          maxEntries: 8,
          entries: 1,
          startsAt: '2030-11-16T18:00:00.000Z',
          owner: null,
          registration: 'board_needed',
          avgLimit: null,
          eligibility: null,
          team: null,
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
        avgLimit: null,
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
      expect((await get('player', '/api/tournaments/mine')).json().organizing).toEqual([])
      expect((await get('player')).json().tournaments.map((x: { id: string }) => x.id)).not.toContain(t.id)
      expect((await get('cohost', `/api/tournaments/${t.id}`)).json()).toMatchObject({ role: 'organizer' })
      expect((await get('cohost', '/api/tournaments/mine')).json().organizing).toMatchObject([
        { tournament: { id: t.id }, role: 'organizer' },
      ])
      expect((await get('admin', '/api/tournaments/mine')).json().organizing).toMatchObject([{ tournament: { id: t.id }, role: 'owner' }])
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

    it('keeps an in-person tournament editable when its organizers added players, but its team size comes with its list', async () => {
      const t = await created('admin', {
        ...input,
        access: 'in_person',
        startsAt: null,
        settings: { ...input.settings, registrationClosesMinutes: null, checkInMinutes: null, noShowMinutes: null },
      })
      await insertTournamentEntry(db, { id: 'bar-1', tournament_id: t.id })
      const res = await send('admin', 'PATCH', `/api/tournaments/${t.id}`, { name: 'Bar Night', format: 'double_elimination' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ name: 'Bar Night', locked: false })
      expect((await send('admin', 'PATCH', `/api/tournaments/${t.id}`, { teamSize: 3 })).json()).toMatchObject({ error: 'locked' })
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

  describe('browse and register solo', () => {
    type Tournament = components['schemas']['Tournament']
    const everyone = ['admin', 'player', 'friend', 'cohost', 'p3', 'p4']
    const register = (user: string, id: string) => send(user, 'POST', `/api/tournaments/${id}/registration`)
    const withdraw = (user: string, id: string) => send(user, 'DELETE', `/api/tournaments/${id}/registration`)
    const error = (res: { json: () => unknown }) => (res.json() as { error: string }).error
    const open = (id: string, rest: Omit<Parameters<typeof insertTournament>[1], 'id'> = {}) =>
      insertTournament(db, { id, status: 'open', owner_user_id: 'cohost', starts_at: new Date('2030-11-16T18:00:00Z'), ...rest })

    beforeAll(async () => {
      await insertUsers(db, ['p3', 'p4'])
      for (const u of everyone) await insertBoard(db, { id: `board-${u}`, owner_user_id: u })
    })
    afterEach(async () => {
      await db.deleteFrom('tournaments').where('id', 'not in', ['weekly', 'draft']).execute()
      await db.deleteFrom('friendships').execute()
    })
    beforeEach(() => setOverrides(new Map([['tournaments.enabled', { mode: 'users', userIds: everyone }]])))

    it('registers, says so on Browse and the detail, and withdraws', async () => {
      await open('cup')
      const res = await register('player', 'cup')
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ entries: 1, registration: 'registered' })
      expect((await register('player', 'cup')).json()).toMatchObject({ entries: 1 })
      const listed = (await get('player')).json<{ tournaments: { id: string; registration: string }[] }>().tournaments
      expect(listed.find(t => t.id === 'cup')).toMatchObject({ registration: 'registered' })
      expect((await get('friend', '/api/tournaments/cup')).json()).toMatchObject({ entries: 1, registration: 'open' })

      expect((await withdraw('player', 'cup')).json()).toMatchObject({ entries: 0, registration: 'open' })
      expect((await withdraw('player', 'cup')).statusCode).toBe(409)
      expect((await register('player', 'cup')).json()).toMatchObject({ entries: 1, registration: 'registered' })
    })

    it('answers 409 full past capacity, and lets nobody slip into the last spot together', async () => {
      await open('small', { max_entries: 2 })
      await register('player', 'small')
      const both = await Promise.all([register('friend', 'small'), register('p3', 'small')])
      expect(both.map(r => r.statusCode).sort()).toEqual([200, 409])
      const refused = both.find(r => r.statusCode === 409)!
      expect(error(refused)).toBe('full')
      expect((await get('p4', '/api/tournaments/small')).json()).toMatchObject({ entries: 2, registration: 'full' })
    })

    it('closes registration at registration_closes_at', async () => {
      const soon = new Date(Date.now() + 30 * 60_000)
      const settings = {
        ...(await db.selectFrom('tournaments').select('settings').where('id', '=', 'weekly').executeTakeFirstOrThrow()).settings,
      }
      await open('closing', { starts_at: soon, settings: JSON.stringify({ ...settings, registrationClosesMinutes: 60 }) })
      const res = await register('player', 'closing')
      expect(res.statusCode).toBe(409)
      expect(error(res)).toBe('registration closed')
      await open('started', { status: 'check_in' })
      expect(error(await register('player', 'started'))).toBe('registration closed')
    })

    it('needs a paired board unless the organizer allows manual scoring', async () => {
      await insertUsers(db, ['boardless'])
      await setOverrides(new Map([['tournaments.enabled', { mode: 'users', userIds: [...everyone, 'boardless'] }]]))
      await open('boards')
      const res = await register('boardless', 'boards')
      expect([res.statusCode, error(res)]).toEqual([409, 'paired board needed'])
      const settings = {
        ...(await db.selectFrom('tournaments').select('settings').where('id', '=', 'weekly').executeTakeFirstOrThrow()).settings,
      }
      await open('typed', { settings: JSON.stringify({ ...settings, manualScoring: true }) })
      expect((await register('boardless', 'typed')).statusCode).toBe(200)
    })

    it('checks the average limit: the tag and eligibility on Browse and the detail, 409 not eligible to register', async () => {
      // p3 played 30 legs at a 68.4 average in the last days; p4 none
      await db
        .insertInto('game_sessions')
        .values({
          id: 'avg-game',
          owner_user_id: null,
          board_db_id: null,
          game_id: 'x01',
          config: '{}',
          status: 'finished',
          finished_at: new Date(),
        })
        .execute()
      await db
        .insertInto('game_players')
        .values({
          session_id: 'avg-game',
          seat: 0,
          name: 'p3',
          user_id: 'p3',
          placement: 1,
          stats: JSON.stringify({ average: 68.4, dartsThrown: 600, legsWon: 30 }),
          controller_user_id: 'p3',
          board_db_id: null,
        })
        .execute()
      expect((await get('p3', '/api/tournaments/form')).json()).toEqual({ average: 68.4, legs: 30 })
      expect((await get('p4', '/api/tournaments/form')).json()).toEqual({ average: null, legs: 0 })

      const settings = {
        ...(await db.selectFrom('tournaments').select('settings').where('id', '=', 'weekly').executeTakeFirstOrThrow()).settings,
      }
      const avgLimit = { min: null, max: 45, teams: 'every', minLegs: 20, lock: true }
      await open('beginners', { settings: JSON.stringify({ ...settings, avgLimit }) })
      const listed = (await get('p3')).json<{ tournaments: { id: string }[] }>().tournaments.find(t => t.id === 'beginners')
      expect(listed).toMatchObject({
        avgLimit,
        registration: 'not_eligible',
        eligibility: { eligible: false, reason: 'above', average: 68.4 },
      })
      expect((await get('p4', '/api/tournaments/beginners')).json()).toMatchObject({
        registration: 'not_eligible',
        eligibility: { eligible: false, reason: 'few_legs', average: null },
      })
      const res = await register('p3', 'beginners')
      expect([res.statusCode, error(res)]).toEqual([409, 'not eligible'])

      await open('advanced', { settings: JSON.stringify({ ...settings, avgLimit: { ...avgLimit, min: 50, max: null } }) })
      expect((await register('p3', 'advanced')).json()).toMatchObject({
        registration: 'registered',
        eligibility: { eligible: true, reason: null, average: 68.4 },
      })
      // Without a limit there is nothing to check
      expect((await get('p4', '/api/tournaments/weekly')).json()).toMatchObject({ eligibility: null })
      await db.deleteFrom('game_sessions').where('id', '=', 'avg-game').execute()
    })

    it('leaves team and in-person tournaments to captains and organizers', async () => {
      await open('pairs', { team_size: 2 })
      expect(error(await register('player', 'pairs'))).toBe('team tournament')
      await open('venue', { access: 'in_person', starts_at: null })
      expect(error(await register('player', 'venue'))).toBe('in person')
    })

    it("hides a friends-only tournament from all but the owner's friends, on Browse and to register", async () => {
      await open('friends', { access: 'friends' })
      await db.insertInto('friendships').values({ id: 'f1', requester_id: 'friend', addressee_id: 'cohost', status: 'accepted' }).execute()
      const ids = async (u: string) => (await get(u)).json<{ tournaments: { id: string }[] }>().tournaments.map(t => t.id)
      expect(await ids('friend')).toContain('friends')
      expect(await ids('player')).not.toContain('friends')
      expect((await get('player', '/api/tournaments/friends')).statusCode).toBe(404)
      expect((await register('player', 'friends')).statusCode).toBe(404)
      expect((await register('friend', 'friends')).statusCode).toBe(200)
    })

    it('hides an invite-link tournament from Browse but opens it by its code', async () => {
      const res = await send('admin', 'POST', '/api/tournaments', {
        name: 'Living Room Classic',
        description: '',
        access: 'invite',
        gameId: 'x01',
        gameConfig: {},
        format: 'single_elimination',
        teamSize: 1,
        maxEntries: 8,
        startsAt: '2030-11-23T15:00:00.000Z',
        settings: {
          seeding: 'random',
          firstTo: 3,
          longerFinal: null,
          groups: null,
          registrationClosesMinutes: 60,
          checkInMinutes: null,
          plannedFor: null,
          manualScoring: false,
          noShowMinutes: 10,
          avgLimit: null,
        },
      })
      const draft = res.json<Tournament>()
      expect(draft.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
      await send('admin', 'POST', `/api/tournaments/${draft.id}/publish`)
      const code = draft.inviteCode!
      const ids = async (u: string) => (await get(u)).json<{ tournaments: { id: string }[] }>().tournaments.map(t => t.id)
      expect(await ids('player')).not.toContain(draft.id)

      const landed = await get('player', `/api/tournaments/code/${code.toLowerCase()}`)
      expect(landed.json()).toMatchObject({ id: draft.id, registration: 'open', inviteCode: null })
      expect((await get('player', '/api/tournaments/code/NOPE22')).statusCode).toBe(404)

      // The id alone is not the link: without the code it is hidden and refuses to register
      expect((await get('player', `/api/tournaments/${draft.id}`)).statusCode).toBe(404)
      expect((await register('player', draft.id)).statusCode).toBe(404)
      expect((await send('player', 'POST', `/api/tournaments/${draft.id}/registration?code=WRONG2`)).statusCode).toBe(404)
      const joined = await send('player', 'POST', `/api/tournaments/${draft.id}/registration?code=${code.toLowerCase()}`)
      expect(joined.json()).toMatchObject({ registration: 'registered' })
      expect((await get('player', `/api/tournaments/${draft.id}`)).json()).toMatchObject({ registration: 'registered' })
      expect((await get('friend', `/api/tournaments/${draft.id}`)).statusCode).toBe(404)
      expect(await ids('player')).toContain(draft.id)
      expect(await ids('friend')).not.toContain(draft.id)
    })

    it("names the caller's friends who are in", async () => {
      await open('social')
      await db.insertInto('friendships').values({ id: 'f2', requester_id: 'player', addressee_id: 'friend', status: 'accepted' }).execute()
      await db.insertInto('friendships').values({ id: 'f3', requester_id: 'p3', addressee_id: 'player', status: 'accepted' }).execute()
      for (const u of ['friend', 'p3', 'p4']) await register(u, 'social')
      const t = (await get('player', '/api/tournaments/social')).json<Tournament>()
      expect(t.friendsIn.map(f => [f.id, f.name, f.avatar.kind])).toEqual([
        ['friend', 'friend', 'preset'],
        ['p3', 'p3', 'preset'],
      ])
    })
    describe('check-in, start and withdrawing once it runs', () => {
      const status = (id: string, s: 'check_in' | 'running') =>
        db.updateTable('tournaments').set({ status: s }).where('id', '=', id).execute()

      it('checks a registered player in during the check-in only, and says so', async () => {
        await open('ci')
        await register('player', 'ci')
        const checkIn = (user: string) => send(user, 'POST', '/api/tournaments/ci/check-in')
        expect((await checkIn('player')).statusCode).toBe(409)
        await status('ci', 'check_in')
        expect((await checkIn('friend')).statusCode).toBe(409)
        expect((await checkIn('player')).json()).toMatchObject({ checkedIn: true, registration: 'registered' })
        expect((await checkIn('player')).statusCode).toBe(409)
        expect((await get('friend', '/api/tournaments/ci')).json()).toMatchObject({ checkedIn: false })
      })

      it('lets only organizers start a tournament, and answers 409 when the service will not', async () => {
        await open('go', { starts_at: null })
        tournaments.organizerStart.mockClear()
        expect((await send('player', 'POST', '/api/tournaments/go/start')).statusCode).toBe(403)
        expect((await send('cohost', 'POST', '/api/tournaments/go/start')).statusCode).toBe(200)
        expect(tournaments.organizerStart).toHaveBeenCalledWith('go')
        tournaments.organizerStart.mockResolvedValueOnce('not_startable' as never)
        expect((await send('cohost', 'POST', '/api/tournaments/go/start')).statusCode).toBe(409)
      })

      it('withdraws a player from a running tournament and hands their matches over', async () => {
        await open('live')
        await register('player', 'live')
        await status('live', 'running')
        tournaments.withdrawn.mockClear()
        expect((await withdraw('player', 'live')).json()).toMatchObject({ registration: 'closed' })
        const entry = await db
          .selectFrom('tournament_players')
          .select('entry_id')
          .where('tournament_id', '=', 'live')
          .where('user_id', '=', 'player')
          .executeTakeFirstOrThrow()
        expect(tournaments.withdrawn).toHaveBeenCalledWith('live', entry.entry_id)
        expect((await withdraw('player', 'live')).statusCode).toBe(409)
      })
    })
  })
})
