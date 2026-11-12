import '../test/authByHeader.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import type { components } from '../schema/api.js'
import type { TournamentRequestMessage } from '../schema/lobby-ws.js'
import { teamRequestsFor } from '../db/tournamentRoster.js'
import { insertBoard, insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { setOverrides, setupFlags } from '../flags/index.js'
import { TournamentService } from '../tournaments/service.js'
import { createFastify } from './fastify.js'
import { tournamentsApiPlugin } from './tournaments.js'

type Tournament = components['schemas']['Tournament']
type Summary = components['schemas']['TournamentSummary']
type Options = components['schemas']['TournamentTeamOptions']

const START = new Date('2030-11-15T20:00:00Z')
const settings = (over: object = {}) =>
  JSON.stringify({
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
    ...over,
  })
const teamAverage55 = { min: 55, max: null, teams: 'team', minLegs: 0, lock: true }

describe.skipIf(!process.env.TEST_DATABASE_URL)('registering a team', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let requests: [string, TournamentRequestMessage][]
  let pushedMe: string[]

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_teams_api_test'))
    await insertUsers(db, [
      { id: 'chris', name: 'Christoph' },
      { id: 'lena', name: 'Lena' },
      { id: 'max', name: 'Max' },
      { id: 'anna', name: 'Anna' },
      { id: 'nobody', name: 'Nobody' },
    ])
    for (const u of ['chris', 'lena', 'max', 'anna']) await insertBoard(db, { id: `board-${u}`, owner_user_id: u, name: `${u}'s board` })
    await setupFlags(new Set())
    await setOverrides(new Map([['tournaments.enabled', { mode: 'on', userIds: [] }]]))
    // Each player's 30-day form, as the board shows it
    for (const [u, average] of [
      ['chris', 68.4],
      ['lena', 61.2],
      ['max', 41.2],
      ['anna', 63],
    ] as const) {
      await db
        .insertInto('game_sessions')
        .values({
          id: `form-${u}`,
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
          session_id: `form-${u}`,
          seat: 0,
          name: u,
          user_id: u,
          placement: 1,
          stats: JSON.stringify({ average, dartsThrown: 300, legsWon: 30 }),
          controller_user_id: u,
          board_db_id: null,
        })
        .execute()
    }
    // Double Agents: Christoph captains Lena and Max. Checkout Crew: Anna captains Christoph
    await db.transaction().execute(async tx => {
      await tx
        .insertInto('teams')
        .values({ id: 'da', name: 'Double Agents', tag: 'DA', color: '#9b7bff', captain_user_id: 'chris' })
        .execute()
      await tx
        .insertInto('teams')
        .values({ id: 'cc', name: 'Checkout Crew', tag: 'CC', color: '#4fd1c5', captain_user_id: 'anna' })
        .execute()
      await tx
        .insertInto('team_members')
        .values([
          { team_id: 'da', user_id: 'chris' },
          { team_id: 'da', user_id: 'lena' },
          { team_id: 'da', user_id: 'max' },
          { team_id: 'cc', user_id: 'anna' },
          { team_id: 'cc', user_id: 'chris' },
        ])
        .execute()
    })
  })
  beforeEach(async () => {
    requests = []
    pushedMe = []
    await db.deleteFrom('tournaments').execute()
    await insertTournament(db, {
      id: 'cup',
      name: 'November Doubles Cup',
      status: 'open',
      team_size: 2,
      max_entries: 8,
      starts_at: START,
      settings: settings(),
    })
  })
  afterAll(async () => close())

  const withdrawn = vi.fn((_tournamentId: string, _entryId: string) => Promise.resolve())
  // One app per test, as the server has one: the remind limit lives in it
  let app: ReturnType<typeof createFastify>
  beforeEach(() => {
    app = createFastify()
    app.register(tournamentsApiPlugin, {
      db,
      hub: { sendTournamentRequest: (u: string, m: TournamentRequestMessage) => requests.push([u, m]) },
      lobbies: {
        pushMe: (u: string) => {
          pushedMe.push(u)
          return Promise.resolve()
        },
      },
      tournaments: { organizerStart: () => Promise.resolve('started' as const), withdrawn },
    })
  })
  const send = (user: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { 'x-user': user } })
  const registerTeam = (user: string, teamId: string, players: string[]) =>
    send(user, 'POST', '/api/tournaments/cup/teams', { teamId, players })
  const answer = (user: string, accept: boolean) => send(user, 'POST', '/api/tournaments/cup/roster/answer', { accept })
  const detail = async (user: string) => (await send(user, 'GET', '/api/tournaments/cup')).json<Tournament>()
  const error = (res: { json: () => unknown }) => (res.json() as { error: string }).error

  it("lists your teams with each member's form, board and the captain first", async () => {
    const res = await send('chris', 'GET', '/api/tournaments/cup/team-options')
    expect(res.statusCode).toBe(200)
    const { teams } = res.json<Options>()
    expect(teams.map(t => [t.name, t.captainId])).toEqual([
      ['Double Agents', 'chris'],
      ['Checkout Crew', 'anna'],
    ])
    expect(teams[1]?.members.map(m => m.user.id)).toEqual(['anna', 'chris'])
    expect(teams[0]?.members[0]).toMatchObject({ form: { average: 68.4, legs: 30 }, board: "chris's board", taken: false })
  })

  it('holds the spot while a picked player is to confirm, and counts it', async () => {
    const res = await registerTeam('chris', 'da', ['chris', 'lena'])
    expect(res.statusCode).toBe(200)
    expect(res.json<Tournament>()).toMatchObject({
      entries: 1,
      registration: 'registered',
      team: {
        status: 'pending',
        team: { id: 'da', name: 'Double Agents' },
        captainId: 'chris',
        confirmBy: '2030-11-15T19:00:00.000Z',
        slots: [
          { position: 0, user: { id: 'chris', name: 'Christoph' }, confirmed: true },
          { position: 1, user: { id: 'lena', name: 'Lena' }, confirmed: false },
        ],
      },
    })
    // Only Lena is asked; the captain counts as confirmed
    expect(requests).toEqual([
      [
        'lena',
        {
          type: 'tournament.request',
          tournamentId: 'cup',
          tournamentName: 'November Doubles Cup',
          role: 'player',
          team: 'Double Agents',
          from: { id: 'chris', name: 'Christoph' },
        },
      ],
    ])
    expect(pushedMe).toEqual(['lena'])
    expect(await teamRequestsFor(db, 'lena', new Date('2030-11-01T00:00:00Z'))).toMatchObject([
      { tournamentId: 'cup', team: { id: 'da', tag: 'DA' }, from: { id: 'chris' }, confirmBy: '2030-11-15T19:00:00.000Z' },
    ])
    // Browse shows the team, the spot taken
    const listed = (await send('lena', 'GET', '/api/tournaments')).json<{ tournaments: Summary[] }>().tournaments[0]
    expect(listed).toMatchObject({ entries: 1, team: { status: 'pending', captainId: 'chris' } })
  })

  it('counts pending teams against the spots', async () => {
    await db.updateTable('tournaments').set({ max_entries: 2 }).where('id', '=', 'cup').execute()
    await insertTournamentEntry(db, { id: 'other', tournament_id: 'cup', status: 'pending' })
    expect((await registerTeam('anna', 'cc', ['anna', 'chris'])).statusCode).toBe(200)
    const res = await registerTeam('chris', 'da', ['lena', 'max'])
    expect([res.statusCode, error(res)]).toEqual([409, 'full'])
  })

  it('lets only the captain register, with members, the right count and nobody in twice', async () => {
    expect((await registerTeam('chris', 'cc', ['anna', 'chris'])).statusCode).toBe(403)
    expect(error(await registerTeam('chris', 'da', ['chris', 'nobody']))).toBe('not a member')
    expect(error(await registerTeam('chris', 'da', ['chris', 'lena', 'max']))).toBe('wrong player count')
    expect((await registerTeam('anna', 'cc', ['anna', 'chris'])).statusCode).toBe(200)
    expect(error(await registerTeam('chris', 'da', ['chris', 'lena']))).toBe('already in this tournament')
    expect(error(await registerTeam('anna', 'cc', ['anna', 'chris']))).toBe('already registered')
    // A player registers through their captain
    expect(error(await send('lena', 'POST', '/api/tournaments/cup/registration'))).toBe('team tournament')
  })

  it('checks the team average from the picked players', async () => {
    await db
      .updateTable('tournaments')
      .set({ settings: settings({ avgLimit: teamAverage55 }) })
      .where('id', '=', 'cup')
      .execute()
    const low = await registerTeam('chris', 'da', ['chris', 'max'])
    expect([low.statusCode, error(low)]).toEqual([409, 'not eligible'])
    expect((await registerTeam('chris', 'da', ['chris', 'lena'])).statusCode).toBe(200)
  })

  it('checks every player alone when the limit says so', async () => {
    const every = { ...teamAverage55, min: 62, teams: 'every' }
    await db
      .updateTable('tournaments')
      .set({ settings: settings({ avgLimit: every }) })
      .where('id', '=', 'cup')
      .execute()
    // Christoph 68.4 fits, Lena 61.2 does not, though their mean would
    expect(error(await registerTeam('chris', 'da', ['chris', 'lena']))).toBe('not eligible')
  })

  it('needs every picked player to have a board unless manual scoring is on', async () => {
    await db.deleteFrom('boards').where('owner_user_id', '=', 'lena').execute()
    expect(error(await registerTeam('chris', 'da', ['chris', 'lena']))).toBe('paired board needed')
    await insertBoard(db, { id: 'board-lena', owner_user_id: 'lena', name: "lena's board" })
  })

  it('registers the team once everyone confirmed', async () => {
    await registerTeam('chris', 'da', ['chris', 'lena'])
    expect((await answer('lena', true)).statusCode).toBe(204)
    expect((await detail('chris')).team).toMatchObject({ status: 'registered', slots: [{ confirmed: true }, { confirmed: true }] })
    expect(await teamRequestsFor(db, 'lena', new Date('2030-11-01T00:00:00Z'))).toEqual([])
  })

  it('frees the player slot on a decline, not the spot; the captain picks another', async () => {
    await registerTeam('chris', 'da', ['chris', 'lena'])
    expect((await answer('lena', false)).statusCode).toBe(204)
    const after = await detail('chris')
    expect(after).toMatchObject({
      entries: 1,
      team: { status: 'pending', slots: [{ user: { id: 'chris' } }, { position: 1, user: null }] },
    })
    // Lena holds nothing now
    expect((await detail('lena')).team).toBeNull()

    requests = []
    const changed = await send('chris', 'PUT', '/api/tournaments/cup/roster/1', { userId: 'max' })
    expect(changed.statusCode).toBe(200)
    expect(changed.json<Tournament>().team?.slots[1]).toEqual({ position: 1, user: { id: 'max', name: 'Max' }, confirmed: false })
    expect(requests.map(([u]) => u)).toEqual(['max'])
    await answer('max', true)
    expect((await detail('chris')).team?.status).toBe('registered')
  })

  it('changes a player still to confirm, never one who confirmed, and checks the limit again', async () => {
    await registerTeam('chris', 'da', ['chris', 'lena'])
    expect(error(await send('chris', 'PUT', '/api/tournaments/cup/roster/0', { userId: 'max' }))).toBe('confirmed')
    await db
      .updateTable('tournaments')
      .set({ settings: settings({ avgLimit: teamAverage55 }) })
      .where('id', '=', 'cup')
      .execute()
    expect(error(await send('chris', 'PUT', '/api/tournaments/cup/roster/1', { userId: 'max' }))).toBe('not eligible')
    expect(error(await send('chris', 'PUT', '/api/tournaments/cup/roster/1', { userId: 'anna' }))).toBe('not a member')
    expect((await send('lena', 'PUT', '/api/tournaments/cup/roster/1', { userId: 'max' })).statusCode).toBe(404)
  })

  it('reminds the players still to confirm, at most every 15 minutes', async () => {
    await registerTeam('chris', 'da', ['chris', 'lena'])
    requests = []
    expect((await send('chris', 'POST', '/api/tournaments/cup/roster/remind')).statusCode).toBe(204)
    expect(requests.map(([u, m]) => [u, m.role])).toEqual([['lena', 'player']])
    const again = await send('chris', 'POST', '/api/tournaments/cup/roster/remind')
    expect([again.statusCode, error(again)]).toEqual([429, 'reminded recently'])
    expect((await send('lena', 'POST', '/api/tournaments/cup/roster/remind')).statusCode).toBe(404)
  })

  it('lets only the captain withdraw the team', async () => {
    await registerTeam('chris', 'da', ['chris', 'lena'])
    expect((await send('lena', 'DELETE', '/api/tournaments/cup/registration')).statusCode).toBe(409)
    expect((await send('chris', 'DELETE', '/api/tournaments/cup/registration')).statusCode).toBe(200)
    // Withdrawn players can be picked again
    expect((await registerTeam('chris', 'da', ['chris', 'lena'])).statusCode).toBe(200)
  })

  it('lets a captain register a team they do not play in, and withdraw it', async () => {
    const res = await registerTeam('chris', 'da', ['lena', 'max'])
    expect(res.json<Tournament>()).toMatchObject({
      registration: 'registered',
      team: { captainId: 'chris', slots: [{ confirmed: false }, { confirmed: false }] },
    })
    expect(requests.map(([u]) => u)).toEqual(['lena', 'max'])
    expect((await send('chris', 'DELETE', '/api/tournaments/cup/registration')).json<Tournament>()).toMatchObject({
      entries: 0,
      team: null,
    })
  })

  it('hands a running team a captain withdraws to the runner by its entry, though the captain does not play', async () => {
    await registerTeam('chris', 'da', ['lena', 'max'])
    const entry = await db.selectFrom('tournament_entries').select('id').where('tournament_id', '=', 'cup').executeTakeFirstOrThrow()
    await db.updateTable('tournament_entries').set({ status: 'registered' }).where('tournament_id', '=', 'cup').execute()
    await db.updateTable('tournaments').set({ status: 'running' }).where('id', '=', 'cup').execute()
    withdrawn.mockClear()
    expect((await send('chris', 'DELETE', '/api/tournaments/cup/registration')).statusCode).toBe(200)
    expect(withdrawn).toHaveBeenCalledWith('cup', entry.id)
  })

  it("leaves a claimed in-person spot alone: no answer, no team card, the organizer's entry kept", async () => {
    await insertTournament(db, { id: 'pub', name: 'Pub Pairs', status: 'open', access: 'in_person', team_size: 2, owner_user_id: 'anna' })
    await insertTournamentEntry(db, { id: 'pub-e', tournament_id: 'pub', name: 'The Pair', status: 'registered' })
    await db
      .insertInto('tournament_players')
      .values([
        {
          id: 'pub-1',
          tournament_id: 'pub',
          entry_id: 'pub-e',
          user_id: 'lena',
          name: 'Lena',
          position: 0,
          kind: 'spot',
          claim_code: 'CLAIM1',
        },
        {
          id: 'pub-2',
          tournament_id: 'pub',
          entry_id: 'pub-e',
          user_id: null,
          name: 'Guest',
          position: 1,
          kind: 'spot',
          claim_code: 'CLAIM2',
        },
      ])
      .execute()
    for (const accept of [false, true]) {
      const res = await send('lena', 'POST', '/api/tournaments/pub/roster/answer', { accept })
      expect([res.statusCode, error(res)]).toEqual([409, 'you were not picked for a team here'])
    }
    expect(await db.selectFrom('tournament_players').select('id').where('entry_id', '=', 'pub-e').execute()).toHaveLength(2)
    expect((await db.selectFrom('tournament_entries').select('status').where('id', '=', 'pub-e').executeTakeFirstOrThrow()).status).toBe(
      'registered',
    )
    expect((await send('lena', 'GET', '/api/tournaments/pub')).json<Tournament>().team).toBeNull()
  })

  it('releases the teams still to confirm when registration closes, and answers no more', async () => {
    await registerTeam('chris', 'da', ['chris', 'lena'])
    // After the close (19:00), before check-in (19:30)
    const service = new TournamentService({
      db,
      engine: {} as never,
      isOnline: () => false,
      send: () => {},
      now: () => Date.parse('2030-11-15T19:10:00Z'),
      warn: () => {},
    })
    await service.tick()
    const entries = await db.selectFrom('tournament_entries').select('status').where('tournament_id', '=', 'cup').execute()
    expect(entries).toEqual([{ status: 'withdrawn' }])
    expect((await detail('chris')).entries).toBe(0)
    expect(await teamRequestsFor(db, 'lena', new Date('2030-11-15T19:10:00Z'))).toEqual([])
  })

  it('keeps a complete team at the close', async () => {
    await registerTeam('chris', 'da', ['chris', 'lena'])
    await answer('lena', true)
    const service = new TournamentService({
      db,
      engine: {} as never,
      isOnline: () => false,
      send: () => {},
      now: () => Date.parse('2030-11-15T19:10:00Z'),
      warn: () => {},
    })
    await service.tick()
    expect((await detail('chris')).team?.status).toBe('registered')
  })

  it('refuses answers once registration has closed', async () => {
    await registerTeam('chris', 'da', ['chris', 'lena'])
    await db
      .updateTable('tournaments')
      .set({ starts_at: new Date(Date.now() + 30 * 60_000) })
      .where('id', '=', 'cup')
      .execute()
    const res = await answer('lena', true)
    expect([res.statusCode, error(res)]).toEqual([409, 'registration closed'])
  })
})
