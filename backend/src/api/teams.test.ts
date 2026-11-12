import '../test/authByHeader.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { releaseTeamsOf } from '../db/teams.js'
import { insertTournament, insertTournamentEntry, insertUsers } from '../test/fixtures.js'
import { setupFlags } from '../flags/index.js'
import { MeServerMessageSchema } from '../schema/zod.js'
import type { TeamInviteMessage } from '../schema/lobby-ws.js'
import { createFastify } from './fastify.js'
import { teamsApiPlugin } from './teams.js'

// Everyone but `outsider` is an admin, who has tournaments.enabled by default
const PLAYERS = ['cap', 'lena', 'max', 'sophie', 'p5', 'p6', 'p7', 'p8', 'p9']

describe.skipIf(!process.env.TEST_DATABASE_URL)('teams API', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let pushedMe: string[]
  let toasts: { userId: string; msg: TeamInviteMessage }[]

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('teams_api_test'))
    await setupFlags(new Set())
  })
  beforeEach(async () => {
    await sql`TRUNCATE "user", teams CASCADE`.execute(db)
    await insertUsers(db, [...PLAYERS.map(id => ({ id, role: 'admin' })), 'outsider'])
    pushedMe = []
    toasts = []
  })
  afterAll(async () => close())

  const call = (user: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) => {
    const app = createFastify()
    app.register(teamsApiPlugin, {
      db,
      lobbies: {
        pushMe: (userId: string) => {
          pushedMe.push(userId)
          return Promise.resolve()
        },
      },
      hub: { sendTeamInvite: (userId, msg) => toasts.push({ userId, msg }) },
    })
    return app.inject({ method, url, payload, headers: { 'x-user': user } })
  }
  const create = (user: string, body: object = {}) =>
    call(user, 'POST', '/api/teams', { name: `${user} team`, tag: 'TM', color: '#9b7bff', ...body })
  const createId = async (user: string, body: object = {}) => {
    const res = await create(user, body)
    expect(res.statusCode).toBe(201)
    return res.json<{ id: string }>().id
  }
  const list = async (user: string) => (await call(user, 'GET', '/api/teams')).json<{ teams: any[]; invites: any[] }>()
  const invite = (user: string, teamId: string, userId: string) => call(user, 'POST', `/api/teams/${teamId}/invites`, { userId })
  const accept = (user: string, inviteId: string) => call(user, 'POST', `/api/team-invites/${inviteId}/accept`)
  /** Makes `teamId` have these members (captain `cap` invites, each accepts). */
  async function join(teamId: string, ...users: string[]) {
    for (const u of users) {
      const res = await invite('cap', teamId, u)
      expect(res.statusCode).toBe(201)
      expect((await accept(u, res.json<{ id: string }>().id)).statusCode).toBe(204)
    }
  }

  it('answers 404 while tournaments are off for the caller', async () => {
    expect((await call('outsider', 'GET', '/api/teams')).statusCode).toBe(404)
    expect((await create('outsider')).statusCode).toBe(404)
  })

  it('makes a team with you as captain, invites players, and tells them', async () => {
    const id = await createId('cap', { name: '  Treble   Makers ', tag: 'tm', color: '#3fb6e8', invite: ['lena', 'max'] })
    const [team] = (await list('cap')).teams
    expect(team).toMatchObject({ id, name: 'Treble Makers', tag: 'TM', color: '#3fb6e8', captainUserId: 'cap' })
    expect(team.members.map((m: any) => m.user.id)).toEqual(['cap'])
    expect(team.invites.map((i: any) => i.user.id)).toEqual(['lena', 'max'])
    expect(team.record).toEqual({ wins: 0, losses: 0, tournaments: 0, bestPlace: null })

    expect(toasts.map(t => t.userId)).toEqual(['lena', 'max'])
    expect(pushedMe).toEqual(expect.arrayContaining(['lena', 'max']))
    // The push and the invitee's list carry the same invite, in the /ws/me message's shape
    expect(MeServerMessageSchema.safeParse(toasts[0].msg).success).toBe(true)
    const { invites } = await list('lena')
    expect(invites).toEqual([toasts[0].msg.invite])
    expect(invites[0]).toMatchObject({ team: { id, name: 'Treble Makers', tag: 'TM' }, inviter: { id: 'cap' }, memberCount: 1 })
  })

  describe('name, tag and colour', () => {
    it.each([
      ['ab', 400],
      ['abc', 201],
      ['a'.repeat(24), 201],
      ['a'.repeat(25), 400],
      ['bad\u0007name', 400],
    ])('name %j answers %i', async (name, status) => {
      expect((await create('cap', { name })).statusCode).toBe(status)
    })

    it.each([
      ['T', 400],
      ['TOOLONG', 400],
      ['T1', 400],
      ['abcd', 201],
    ])('tag %j answers %i', async (tag, status) => {
      expect((await create('cap', { tag })).statusCode).toBe(status)
    })

    it('refuses a colour outside the palette', async () => {
      expect((await create('cap', { color: '#000000' })).statusCode).toBe(400)
    })

    it('keeps names unique ignoring case, on create and on rename', async () => {
      await createId('cap', { name: 'Double Agents' })
      const taken = await create('lena', { name: 'double agents' })
      expect(taken.statusCode).toBe(409)
      expect(taken.json()).toMatchObject({ code: 'name_taken' })
      const other = await createId('lena', { name: 'Checkout Crew' })
      expect((await call('lena', 'PATCH', `/api/teams/${other}`, { name: 'DOUBLE AGENTS' })).json()).toMatchObject({ code: 'name_taken' })
      expect((await call('lena', 'PATCH', `/api/teams/${other}`, { name: 'Crew', tag: 'cc', color: '#c6f24e' })).statusCode).toBe(204)
      expect((await list('lena')).teams[0]).toMatchObject({ name: 'Crew', tag: 'CC', color: '#c6f24e' })
    })
  })

  it('holds at most 8 players, pending invites included', async () => {
    const id = await createId('cap')
    await join(id, 'lena', 'max', 'sophie')
    for (const u of ['p5', 'p6', 'p7', 'p8']) expect((await invite('cap', id, u)).statusCode).toBe(201)
    const full = await invite('cap', id, 'p9')
    expect(full.statusCode).toBe(409)
    expect(full.json()).toMatchObject({ code: 'team_full' })
  })

  describe('up to 5 teams per player', () => {
    it('refuses a sixth team', async () => {
      for (let i = 0; i < 5; i++) await createId('cap', { name: `Team ${i}` })
      const res = await create('cap', { name: 'Team 5' })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toMatchObject({ code: 'too_many_teams' })
    })

    it('refuses to invite a player in 5 teams, and to accept a sixth', async () => {
      const id = await createId('cap')
      const pending = (await invite('cap', id, 'lena')).json<{ id: string }>().id
      for (let i = 0; i < 5; i++) await createId('lena', { name: `Lena ${i}` })
      expect((await invite('cap', id, 'lena')).json()).toMatchObject({ code: 'too_many_teams' })
      expect((await accept('lena', pending)).json()).toMatchObject({ code: 'too_many_teams' })
      const max = await invite('cap', id, 'max')
      expect(max.statusCode).toBe(201)
      for (let i = 0; i < 5; i++) await createId('sophie', { name: `Sophie ${i}` })
      expect((await invite('cap', id, 'sophie')).json()).toMatchObject({ code: 'too_many_teams' })
    })
  })

  describe('invites', () => {
    it('expire after 7 days: an expired invite cannot be accepted, and a new one replaces it', async () => {
      const id = await createId('cap')
      const res = await invite('cap', id, 'lena')
      const inviteId = res.json<{ id: string }>().id
      const { expires_at } = await db.selectFrom('team_invites').select('expires_at').where('id', '=', inviteId).executeTakeFirstOrThrow()
      expect(expires_at.getTime() - Date.now()).toBeGreaterThan(6.99 * 24 * 3600 * 1000)
      expect(expires_at.getTime() - Date.now()).toBeLessThanOrEqual(7 * 24 * 3600 * 1000)

      await db
        .updateTable('team_invites')
        .set({ expires_at: new Date(Date.now() - 1000) })
        .execute()
      expect((await accept('lena', inviteId)).statusCode).toBe(404)
      expect((await list('lena')).invites).toEqual([])
      expect((await list('cap')).teams[0].invites).toEqual([])

      const again = await invite('cap', id, 'lena')
      expect(again.statusCode).toBe(201)
      expect((await accept('lena', again.json<{ id: string }>().id)).statusCode).toBe(204)
      expect((await list('lena')).teams.map(t => t.id)).toEqual([id])
    })

    it('refuses a member, a second invite, an unknown account and one without tournaments', async () => {
      const id = await createId('cap')
      await join(id, 'lena')
      expect((await invite('cap', id, 'lena')).json()).toMatchObject({ code: 'already_member' })
      await invite('cap', id, 'max')
      expect((await invite('cap', id, 'max')).json()).toMatchObject({ code: 'already_invited' })
      expect((await invite('cap', id, 'nobody')).statusCode).toBe(404)
      expect((await invite('cap', id, 'outsider')).json()).toMatchObject({ code: 'unavailable' })
      expect((await invite('cap', id, 'cap')).statusCode).toBe(400)
    })

    it('can be declined by the invitee and cancelled by the captain only', async () => {
      const id = await createId('cap')
      await join(id, 'lena')
      const toMax = (await invite('cap', id, 'max')).json<{ id: string }>().id
      const toSophie = (await invite('cap', id, 'sophie')).json<{ id: string }>().id
      expect((await call('lena', 'POST', `/api/team-invites/${toMax}/decline`)).statusCode).toBe(404)
      expect((await call('max', 'POST', `/api/team-invites/${toMax}/decline`)).statusCode).toBe(204)
      expect((await call('lena', 'DELETE', `/api/teams/${id}/invites/${toSophie}`)).statusCode).toBe(403)
      expect((await call('cap', 'DELETE', `/api/teams/${id}/invites/${toSophie}`)).statusCode).toBe(204)
      expect(pushedMe).toEqual(expect.arrayContaining(['max', 'sophie']))
      expect((await accept('sophie', toSophie)).statusCode).toBe(404)
      expect((await list('cap')).teams[0].invites).toEqual([])
    })
  })

  describe('captain', () => {
    it("can't leave before handing over; then leaves like any member", async () => {
      const id = await createId('cap')
      await join(id, 'lena', 'max')
      const refused = await call('cap', 'DELETE', `/api/teams/${id}/members/cap`)
      expect(refused.statusCode).toBe(409)
      expect(refused.json()).toMatchObject({ code: 'captain_must_hand_over' })

      expect((await call('lena', 'PUT', `/api/teams/${id}/captain`, { userId: 'max' })).statusCode).toBe(403)
      expect((await call('cap', 'PUT', `/api/teams/${id}/captain`, { userId: 'sophie' })).statusCode).toBe(404)
      expect((await call('cap', 'PUT', `/api/teams/${id}/captain`, { userId: 'lena' })).statusCode).toBe(204)
      expect((await call('cap', 'DELETE', `/api/teams/${id}/members/cap`)).statusCode).toBe(204)
      const [team] = (await list('lena')).teams
      expect(team.captainUserId).toBe('lena')
      expect(team.members.map((m: any) => m.user.id)).toEqual(['lena', 'max'])
      expect((await list('cap')).teams).toEqual([])
    })

    it('cannot hand over to a player who has left', async () => {
      const id = await createId('cap')
      await join(id, 'lena', 'max')
      expect((await call('lena', 'DELETE', `/api/teams/${id}/members/lena`)).statusCode).toBe(204)
      expect((await call('cap', 'PUT', `/api/teams/${id}/captain`, { userId: 'lena' })).statusCode).toBe(404)
      expect((await list('cap')).teams[0].captainUserId).toBe('cap')
    })

    it('alone in the team, leaving deletes it and withdraws its invites', async () => {
      const id = await createId('cap', { invite: ['lena'] })
      pushedMe = []
      expect((await call('cap', 'DELETE', `/api/teams/${id}/members/cap`)).statusCode).toBe(204)
      expect(await db.selectFrom('teams').selectAll().execute()).toEqual([])
      expect(pushedMe).toEqual(['lena'])
      expect((await list('lena')).invites).toEqual([])
    })

    it('only the captain edits, invites and removes; members may leave; others see nothing', async () => {
      const id = await createId('cap')
      await join(id, 'lena', 'max')
      expect((await call('lena', 'PATCH', `/api/teams/${id}`, { color: '#c6f24e' })).statusCode).toBe(403)
      expect((await invite('lena', id, 'sophie')).statusCode).toBe(403)
      expect((await call('lena', 'DELETE', `/api/teams/${id}/members/max`)).statusCode).toBe(403)
      expect((await call('sophie', 'PATCH', `/api/teams/${id}`, { color: '#c6f24e' })).statusCode).toBe(404)
      expect((await call('sophie', 'DELETE', `/api/teams/${id}/members/lena`)).statusCode).toBe(404)
      expect((await call('cap', 'DELETE', `/api/teams/${id}/members/max`)).statusCode).toBe(204)
      expect((await call('lena', 'DELETE', `/api/teams/${id}/members/lena`)).statusCode).toBe(204)
      expect((await list('cap')).teams[0].members.map((m: any) => m.user.id)).toEqual(['cap'])
    })
  })

  describe('account deletion', () => {
    it("passes a captain's team to the member who joined first, and deletes one nobody else is in", async () => {
      const shared = await createId('cap', { name: 'Shared' })
      await join(shared, 'max', 'lena')
      const alone = await createId('cap', { name: 'Alone' })
      await releaseTeamsOf(db, 'cap')
      await db.deleteFrom('user').where('id', '=', 'cap').execute()
      const teams = await db.selectFrom('teams').select(['id', 'captain_user_id']).execute()
      expect(teams).toEqual([{ id: shared, captain_user_id: 'max' }])
      expect(teams.some(t => t.id === alone)).toBe(false)
    })

    it("refuses to delete a captain's account whose teams weren't handed over", async () => {
      const id = await createId('cap')
      await join(id, 'lena')
      await expect(db.deleteFrom('user').where('id', '=', 'cap').execute()).rejects.toThrow(/teams_captain_is_member/)
    })
  })

  it("shows the team's tournament record, places and the members' ratings", async () => {
    const id = await createId('cap')
    await join(id, 'lena')
    await db.insertInto('ranked_ratings').values({ user_id: 'lena', mode: '1v1', rating: 1302, matches: 12 }).execute()
    await db.insertInto('ranked_ratings').values({ user_id: 'cap', mode: '1v1', rating: 1250, matches: 2 }).execute()
    await insertTournament(db, {
      id: 'cup',
      name: 'Pub Pairs',
      status: 'finished',
      team_size: 2,
      starts_at: new Date('2026-11-02T18:00:00Z'),
    })
    await insertTournamentEntry(db, { id: 'us', tournament_id: 'cup', team_id: id, final_place: 2 })
    await insertTournamentEntry(db, { id: 'them', tournament_id: 'cup' })
    await insertTournamentEntry(db, { id: 'third', tournament_id: 'cup' })
    const match = (slot: number, b: string | null, winner: string, outcome: 'played' | 'bye') =>
      db
        .insertInto('tournament_matches')
        .values({
          id: `m${slot}`,
          tournament_id: 'cup',
          bracket: 'main',
          round: 1,
          slot,
          entry_a_id: 'us',
          entry_b_id: b,
          first_to: 2,
          status: 'finished',
          outcome,
          winner_entry_id: winner,
        })
        .execute()
    await match(0, 'them', 'us', 'played')
    await match(1, 'third', 'third', 'played')
    await match(2, null, 'us', 'bye')

    const [team] = (await list('cap')).teams
    expect(team.record).toEqual({ wins: 1, losses: 1, tournaments: 1, bestPlace: 2 })
    expect(team.tournaments).toEqual([
      { id: 'cup', name: 'Pub Pairs', startsAt: '2026-11-02T18:00:00.000Z', status: 'finished', entryStatus: 'registered', finalPlace: 2 },
    ])
    expect(team.members.map((m: any) => [m.user.id, m.rating])).toEqual([
      ['cap', null],
      ['lena', 1302],
    ])
    expect(team.average).toBeNull()
  })
})
