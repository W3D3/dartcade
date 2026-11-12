import '../test/authByHeader.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import type { components } from '../schema/api.js'
import { insertBoard, insertTournament, insertUsers } from '../test/fixtures.js'
import { setupFlags } from '../flags/index.js'
import { createFastify } from './fastify.js'
import { tournamentsApiPlugin } from './tournaments.js'

type Participants = components['schemas']['TournamentParticipants']
type Entry = components['schemas']['TournamentParticipantsInput']['entries'][number]

const IN_PERSON_SETTINGS = JSON.stringify({
  seeding: 'random',
  firstTo: 3,
  longerFinal: null,
  groups: null,
  registrationClosesMinutes: null,
  checkInMinutes: null,
  plannedFor: null,
  manualScoring: true,
  noShowMinutes: null,
  avgLimit: null,
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('in-person participants API', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_participants_api_test'))
    await insertUsers(db, [
      { id: 'admin', role: 'admin' },
      { id: 'boss', role: 'admin' },
      { id: 'anna', name: 'anna.b', role: 'admin' },
      'stranger',
    ])
    await setupFlags(new Set())
    const inPerson = {
      owner_user_id: 'admin',
      access: 'in_person' as const,
      settings: IN_PERSON_SETTINGS,
      game_config: JSON.stringify({ startScore: 501 }),
    }
    await insertTournament(db, { id: 'club', ...inPerson, max_entries: 4 })
    await insertTournament(db, { id: 'pairs', ...inPerson, team_size: 2 })
    await insertTournament(db, { id: 'started', ...inPerson, status: 'running' })
    await insertTournament(db, { id: 'online', owner_user_id: 'admin', status: 'open' })
    await insertTournament(db, { id: 'trio', ...inPerson, team_size: 2 })
  })
  afterAll(async () => close())

  const send = (user: string, method: 'GET' | 'PUT' | 'POST' | 'PATCH', url: string, payload?: object) => {
    const app = createFastify()
    app.register(tournamentsApiPlugin, {
      db,
      hub: { sendTournamentRequest: () => {} },
      tournaments: { organizerStart: () => Promise.resolve('started' as const), withdrawn: () => Promise.resolve() },
    })
    return app.inject({ method, url, payload, headers: { 'x-user': user } })
  }
  const put = (id: string, entries: Entry[], user = 'admin') => send(user, 'PUT', `/api/tournaments/${id}/participants`, { entries })
  const solo = (...names: string[]): Entry[] => names.map(name => ({ name, tag: null, color: null, players: [{ name }] }))

  it('stores a solo list in order, each spot with its own claim link', async () => {
    const res = await put('club', solo(' Anna  Berger ', 'Jonas', 'Mia K.'))
    expect(res.statusCode).toBe(200)
    const body = res.json<Participants>()
    expect(body.entries.map(e => [e.name, e.players.map(p => p.name)])).toEqual([
      ['Anna Berger', ['Anna Berger']],
      ['Jonas', ['Jonas']],
      ['Mia K.', ['Mia K.']],
    ])
    const codes = body.entries.map(e => e.players[0].claimCode)
    expect(new Set(codes).size).toBe(3)
    expect(codes.every(c => c.length >= 16)).toBe(true)
    expect(body.startBlocker).toBeNull()
    expect((await send('admin', 'GET', '/api/tournaments/club/participants')).json()).toEqual(body)
  })

  it('keeps a stored spot (and its claim link) by id and removes the ones left out', async () => {
    const before = (await send('admin', 'GET', '/api/tournaments/club/participants')).json<Participants>()
    const [anna, , mia] = before.entries
    const res = await put('club', [
      { id: mia.id, name: '', tag: null, color: null, players: [{ id: mia.players[0].id, name: 'Mia' }] },
      { id: anna.id, name: '', tag: null, color: null, players: [{ id: anna.players[0].id, name: 'Anna Berger' }] },
      ...solo('Paul'),
    ])
    const after = res.json<Participants>()
    expect(after.entries.map(e => e.name)).toEqual(['Mia', 'Anna Berger', 'Paul'])
    expect(after.entries[0].players[0].claimCode).toBe(mia.players[0].claimCode)
    expect(after.entries[1].players[0].claimCode).toBe(anna.players[0].claimCode)
  })

  it('refuses duplicates, more entries than the cap and unknown ids', async () => {
    expect((await put('club', solo('Tom', 'tom'))).statusCode).toBe(400)
    expect((await put('club', solo('A', 'B', 'C', 'D', 'E'))).json()).toMatchObject({ details: [{ message: 'at most 4 players' }] })
    expect((await put('club', [{ id: 'nope', name: '', tag: null, color: null, players: [{ name: 'X' }] }])).statusCode).toBe(400)
  })

  it('moves spots between teams and says which team still has an empty spot', async () => {
    const team = (name: string, tag: string, ...players: Entry['players']): Entry => ({ name, tag, color: '#9b7bff', players })
    const first = (
      await put('pairs', [team('Treble Trouble', 'tt', { name: 'Anna' }, { name: 'Jonas' }), team('Oche Owls', 'OWL', { name: 'Mia' })])
    ).json<Participants>()
    expect(first.entries[0]).toMatchObject({ name: 'Treble Trouble', tag: 'TT', color: '#9b7bff' })
    expect(first.startBlocker).toBe('Oche Owls still needs a 2nd player before you can start.')
    const [tt, owls] = first.entries
    const [anna, jonas] = tt.players
    // Jonas swaps to the Owls; the dropped team's spots that moved survive it
    const res = await put('pairs', [
      { id: owls.id, name: 'Oche Owls', tag: 'OWL', color: null, players: [owls.players[0], { id: jonas.id, name: 'Jonas' }] },
      { name: 'Bar Flies', tag: null, color: null, players: [{ id: anna.id, name: 'Anna' }, { name: 'Sven' }] },
    ])
    expect(res.statusCode).toBe(200)
    const after = res.json<Participants>()
    expect(after.entries.map(e => [e.name, e.players.map(p => p.name)])).toEqual([
      ['Oche Owls', ['Mia', 'Jonas']],
      ['Bar Flies', ['Anna', 'Sven']],
    ])
    expect(after.entries[0].players[1].claimCode).toBe(jonas.claimCode)
    expect(after.startBlocker).toBeNull()
    expect((await put('pairs', [team('Big Team', 'BT', { name: 'A' }, { name: 'B' }, { name: 'C' })])).statusCode).toBe(400)
  })

  it('keeps a claimed name until it is unlinked, and unlinking hands its games back to the guest', async () => {
    const { entries } = (await send('admin', 'GET', '/api/tournaments/club/participants')).json<Participants>()
    const spot = entries[1].players[0]
    await db.updateTable('tournament_players').set({ user_id: 'anna' }).where('id', '=', spot.id).execute()
    await db.insertInto('game_sessions').values({ id: 'g1', game_id: 'x01', config: '{}', status: 'finished' }).execute()
    await db
      .insertInto('game_players')
      .values({ session_id: 'g1', seat: 0, name: 'Anna Berger', user_id: 'anna', tournament_player_id: spot.id })
      .execute()

    const claimed = (await send('admin', 'GET', '/api/tournaments/club/participants')).json<Participants>()
    expect(claimed.entries[1].players[0].claimedBy).toEqual({ id: 'anna', name: 'anna.b' })
    const keep = claimed.entries.map(e => ({
      id: e.id,
      name: e.name,
      tag: null,
      color: null,
      players: e.players.map(p => ({ id: p.id, name: p.name })),
    }))
    keep[1].players[0].name = 'Anna B.'
    expect((await put('club', keep)).json()).toMatchObject({ error: 'claimed' })

    const res = await send('admin', 'POST', `/api/tournaments/club/participants/${spot.id}/unlink`)
    expect(res.statusCode).toBe(200)
    expect(res.json<Participants>().entries[1].players[0]).toMatchObject({ claimedBy: null, claimCode: spot.claimCode })
    const seat = await db.selectFrom('game_players').select('user_id').where('session_id', '=', 'g1').executeTakeFirstOrThrow()
    expect(seat.user_id).toBeNull()
    expect((await send('admin', 'POST', `/api/tournaments/club/participants/${spot.id}/unlink`)).statusCode).toBe(404)
    expect((await put('club', keep)).statusCode).toBe(200)
  })

  describe('changing the tournament once it has players', () => {
    const patch = (id: string, body: object) => send('admin', 'PATCH', `/api/tournaments/${id}`, body)
    const team = (name: string, tag: string, ...players: Entry['players']): Entry => ({ name, tag, color: null, players })

    it('keeps it in person: its spots would be stuck in an online tournament', async () => {
      const res = await patch('club', { access: 'friends' })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toMatchObject({ error: 'locked', details: [{ path: 'body/access' }] })
      expect((await send('admin', 'GET', '/api/tournaments/club/participants')).statusCode).toBe(200)
    })

    it('refuses a new team size without its new list', async () => {
      await put('trio', [
        team('Treble Trouble', 'TT', { name: 'Anna' }, { name: 'Jonas' }),
        team('Oche Owls', 'OWL', { name: 'Mia' }, { name: 'Paul' }),
      ])
      const res = await patch('trio', { teamSize: 1 })
      expect(res.json()).toMatchObject({ error: 'locked', details: [{ path: 'body/teamSize' }] })
      const row = await db.selectFrom('tournaments').select('team_size').where('id', '=', 'trio').executeTakeFirstOrThrow()
      expect(row.team_size).toBe(2)
    })

    it('stores a new team size and its list together, or neither', async () => {
      const { entries } = (await send('admin', 'GET', '/api/tournaments/trio/participants')).json<Participants>()
      const list: Entry[] = entries.map(e => ({
        id: e.id,
        name: e.name,
        tag: e.tag,
        color: null,
        players: e.players.map(p => ({ id: p.id, name: p.name })),
      }))
      const tooMany = list.map(e => ({ ...e, players: [...e.players, { name: `${e.name} 3` }, { name: `${e.name} 4` }] }))
      const refused = await patch('trio', { teamSize: 3, participants: { entries: tooMany } })
      expect(refused.statusCode).toBe(400)
      expect(refused.json()).toMatchObject({
        details: [{ path: 'body/participants/entries/0/players' }, { path: 'body/participants/entries/1/players' }],
      })

      list[0].players.push({ name: 'Kim' })
      const res = await patch('trio', { teamSize: 3, participants: { entries: list } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ teamSize: 3 })
      const after = (await send('admin', 'GET', '/api/tournaments/trio/participants')).json<Participants>()
      expect(after.entries.map(e => e.players.map(p => p.name))).toEqual([
        ['Anna', 'Jonas', 'Kim'],
        ['Mia', 'Paul'],
      ])
      expect(after.startBlocker).toBe('Oche Owls still needs a 3rd player before you can start.')
    })

    it('takes a list only for an in-person tournament', async () => {
      expect((await patch('online', { description: 'x', participants: { entries: [] } })).json()).toMatchObject({ error: 'not in person' })
    })
  })

  describe('paired boards', () => {
    const create = (boardIds: string[]) =>
      send('boss', 'POST', '/api/tournaments', {
        name: 'Board Night',
        description: '',
        access: 'in_person',
        gameId: 'x01',
        gameConfig: { startScore: 501 },
        format: 'single_elimination',
        teamSize: 1,
        maxEntries: 64,
        startsAt: null,
        settings: { ...JSON.parse(IN_PERSON_SETTINGS), boardIds },
      })

    beforeAll(async () => {
      await insertBoard(db, { id: 'bar', owner_user_id: 'boss' })
      await insertBoard(db, { id: 'annas', owner_user_id: 'anna' })
      await insertTournament(db, {
        id: 'venue',
        owner_user_id: 'boss',
        access: 'in_person',
        settings: IN_PERSON_SETTINGS,
        game_config: JSON.stringify({ startScore: 501 }),
      })
      await db.insertInto('tournament_organizers').values({ tournament_id: 'venue', user_id: 'anna' }).execute()
    })

    it('takes only boards the organizer paired, each once', async () => {
      const res = await create(['bar', 'bar'])
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ settings: { boardIds: ['bar'] } })
      for (const ids of [['annas'], ['bar', 'nope']])
        expect((await create(ids)).json()).toMatchObject({ details: [{ path: 'body/settings/boardIds' }] })
    })

    it("lets a co-organizer keep the boards the owner picked, but not add the owner's", async () => {
      const settings = { ...JSON.parse(IN_PERSON_SETTINGS), boardIds: ['bar'] }
      const patch = (user: string, boardIds: string[] | null) =>
        send(user, 'PATCH', '/api/tournaments/venue', { settings: { ...settings, boardIds } })
      const first = await patch('boss', ['bar'])
      expect(first.statusCode, first.body).toBe(200)
      expect((await patch('anna', ['bar', 'annas'])).statusCode).toBe(200)
      await patch('boss', null)
      expect((await patch('anna', ['bar'])).json()).toMatchObject({ details: [{ path: 'body/settings/boardIds' }] })
    })
  })

  it('is for organizers of an in-person tournament that has not started', async () => {
    expect((await put('club', solo('A', 'B'), 'stranger')).statusCode).toBe(404)
    expect((await put('online', solo('A', 'B'))).json()).toMatchObject({ error: 'not in person' })
    expect((await put('started', solo('A', 'B'))).json()).toMatchObject({ error: 'started' })
  })
})
