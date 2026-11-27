import '../test/authByHeader.js'
import { useDbSingleton } from '../test/db.js'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertLobby, insertUsers } from '../test/fixtures.js'
import { createMission } from '../db/missions.js'
import { setupFlags } from '../flags/index.js'
import { MissionSchema, type Mission, type MissionVisibility } from '../shared/missions/types.js'
import { createFastify } from './fastify.js'
import { missionsApiPlugin } from './missions.js'
import type { NewSessionSpec } from '../session/engine.js'

const mission = (o: Partial<Mission> = {}): Mission =>
  MissionSchema.parse({
    name: 'Twenties',
    description: 'Hit them',
    difficulty: 'easy',
    order: 'any',
    onFail: 'retry',
    pause: true,
    rankBy: 'time',
    steps: [{ type: 'hit', targets: ['S20'], hits: 3, inARow: false, order: 'any' }],
    ...o,
  })

const WHO = ['owner', 'friend', 'stranger', 'mod', 'admin'] as const
type Who = (typeof WHO)[number]
const as = (who: Who) => ({ 'x-user': who })

describe.skipIf(!process.env.TEST_DATABASE_URL)('missions API', { timeout: 30_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const started: NewSessionSpec[] = []
  const engine = {
    createWithSeats: vi.fn((spec: NewSessionSpec) => {
      started.push(spec)
      return Promise.resolve({ sessionId: `game-${started.length}` })
    }),
    getSessionByBoard: () => undefined,
  }
  const lobbyStarts: { userId: string; lobbyId: string; game: { gameId: string; config: unknown }; force: boolean }[] = []
  const lobbies = {
    startGame: (userId: string, lobbyId: string, game: { gameId: string; config: Record<string, unknown> }, force: boolean) => {
      lobbyStarts.push({ userId, lobbyId, game, force })
      return Promise.resolve({ sessionId: 'lobby-game' })
    },
  }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('missions_api_test'))
    useDbSingleton(db)
    await insertUsers(db, [
      { id: 'owner', name: 'Olive' },
      { id: 'friend', name: 'Fred' },
      { id: 'stranger', name: 'Stan' },
      { id: 'mod', name: 'Mo', role: 'moderator' },
      { id: 'admin', name: 'Ada', role: 'admin' },
    ])
    await db.insertInto('friendships').values({ id: 'f1', requester_id: 'owner', addressee_id: 'friend', status: 'accepted' }).execute()
    await setupFlags(new Set(['missions.enabled']))
  })
  afterAll(async () => {
    await setupFlags(new Set())
    await close()
  })
  afterEach(async () => {
    await db.deleteFrom('missions').execute()
    await db.deleteFrom('admin_audit').execute()
    started.length = 0
    lobbyStarts.length = 0
  })

  function app() {
    const a = createFastify()
    a.register(missionsApiPlugin, { db, engine, lobbies })
    return a
  }
  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, who: Who, payload?: unknown) =>
    app().inject({ method, url, headers: as(who), payload: payload as object })

  const own = (visibility: MissionVisibility, m = mission()) => createMission(db, 'owner', m, visibility)

  async function missions() {
    const ids = {
      private: await own('private'),
      friends: await own('friends'),
      public: await own('public'),
      hidden: await own('public'),
    }
    await db.updateTable('missions').set({ hidden_at: new Date(), hidden_reason: 'spam' }).where('id', '=', ids.hidden).execute()
    return ids
  }

  // Who may read each kind of mission by its id: the author always, friends a friends one,
  // moderators (admins too) a hidden one, nobody else a private one
  const READS: Record<'private' | 'friends' | 'public' | 'hidden', Who[]> = {
    private: ['owner'],
    friends: ['owner', 'friend'],
    public: [...WHO],
    hidden: ['owner', 'mod', 'admin'],
  }

  it('reads a mission only where the rules say: the matrix', async () => {
    const ids = await missions()
    for (const [kind, readers] of Object.entries(READS) as [keyof typeof READS, Who[]][]) {
      for (const who of WHO) {
        const res = await call('GET', `/api/missions/${ids[kind]}`, who)
        expect([kind, who, res.statusCode]).toEqual([kind, who, readers.includes(who) ? 200 : 404])
      }
    }
  })

  it('lists what each may read, but hidden missions only to their author', async () => {
    const ids = await missions()
    for (const who of WHO) {
      const listed = (await call('GET', '/api/missions', who)).json().missions.map((m: { id: string }) => m.id)
      const expected = (Object.keys(READS) as (keyof typeof READS)[])
        .filter(kind => READS[kind].includes(who) && (kind !== 'hidden' || who === 'owner'))
        .map(kind => ids[kind])
      expect([who, [...listed].sort()]).toEqual([who, [...expected].sort()])
    }
  })

  it('lists nothing on an empty database: no mission ships in code', async () => {
    for (const who of WHO) expect((await call('GET', '/api/missions', who)).json()).toEqual({ missions: [] })
  })

  it('filters Mine, From friends and difficulty, and lists an official mission for everyone', async () => {
    const official = await createMission(db, null, mission({ difficulty: 'hard' }), 'public')
    const hard = await own('friends', mission({ difficulty: 'hard' }))
    const mine = (await call('GET', '/api/missions?filter=mine', 'owner')).json().missions
    expect(mine.map((m: { id: string }) => m.id)).toEqual([hard])
    const fromFriends = (await call('GET', '/api/missions?filter=friends', 'friend')).json().missions
    expect(fromFriends.map((m: { id: string }) => m.id)).toEqual([hard])
    const all = (await call('GET', '/api/missions', 'stranger')).json().missions
    expect(all.map((m: { id: string }) => m.id)).toEqual([official])
    const hards = (await call('GET', '/api/missions?difficulty=hard', 'friend')).json().missions.map((m: { id: string }) => m.id)
    expect(hards).toContain(hard)
    expect(hards).toContain(official)
  })

  it('answers 404 everywhere while missions.enabled is off for the user', async () => {
    const id = await own('public')
    await setupFlags(new Set())
    try {
      expect((await call('GET', '/api/missions', 'stranger')).statusCode).toBe(404)
      expect((await call('GET', `/api/missions/${id}`, 'stranger')).statusCode).toBe(404)
      expect((await call('POST', `/api/missions/${id}/start`, 'stranger', {})).statusCode).toBe(404)
      // admins first: the flag's default rule
      expect((await call('GET', '/api/missions', 'admin')).statusCode).toBe(200)
    } finally {
      await setupFlags(new Set(['missions.enabled']))
    }
  })

  it('creates, updates and deletes only its own; official ones only admins', async () => {
    const created = await call('POST', '/api/missions', 'stranger', { mission: mission(), visibility: 'friends' })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()
    expect(created.json()).toMatchObject({
      visibility: 'friends',
      official: false,
      author: { id: 'stranger', name: 'Stan' },
      canEdit: true,
    })
    expect((await call('PUT', `/api/missions/${id}`, 'owner', { mission: mission(), visibility: 'public' })).statusCode).toBe(404)
    const pub = await call('PUT', `/api/missions/${id}`, 'stranger', { mission: mission({ name: 'Renamed' }), visibility: 'public' })
    expect(pub.json()).toMatchObject({ visibility: 'public', mission: { name: 'Renamed' } })
    expect((await call('PUT', `/api/missions/${id}`, 'owner', { mission: mission(), visibility: 'public' })).statusCode).toBe(403)
    expect((await call('DELETE', `/api/missions/${id}`, 'owner')).statusCode).toBe(403)
    expect((await call('DELETE', `/api/missions/${id}`, 'stranger')).statusCode).toBe(204)

    expect((await call('POST', '/api/missions', 'mod', { mission: mission(), visibility: 'public', official: true })).statusCode).toBe(403)
    const official = await call('POST', '/api/missions', 'admin', { mission: mission(), visibility: 'public', official: true })
    expect(official.json()).toMatchObject({ official: true, author: null, visibility: 'public' })
    const oid = official.json().id
    expect((await call('PUT', `/api/missions/${oid}`, 'stranger', { mission: mission(), visibility: 'private' })).statusCode).toBe(403)
    // An official mission stays everyone's whatever the body says
    expect((await call('PUT', `/api/missions/${oid}`, 'admin', { mission: mission(), visibility: 'private' })).json().visibility).toBe(
      'public',
    )
  })

  describe('making a mission official', () => {
    const put = (id: string, who: Who, body: object) =>
      call('PUT', `/api/missions/${id}`, who, { mission: mission(), visibility: 'friends', ...body })
    const ownerOf = async (id: string) =>
      await db.selectFrom('missions').select(['owner_user_id', 'visibility']).where('id', '=', id).executeTakeFirstOrThrow()

    it('creates one with official: true, for admins only', async () => {
      for (const who of ['owner', 'mod'] as const)
        expect((await call('POST', '/api/missions', who, { mission: mission(), visibility: 'public', official: true })).statusCode).toBe(
          403,
        )
      const res = await call('POST', '/api/missions', 'admin', { mission: mission(), visibility: 'private', official: true })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ official: true, author: null, visibility: 'public' })
    })

    it('promotes and demotes: only an admin sends official, whoever the author is', async () => {
      const mine = await createMission(db, 'admin', mission(), 'private')
      for (const who of ['owner', 'mod', 'stranger'] as const) expect((await put(mine, who, { official: true })).statusCode).toBe(404)
      const theirs = await own('public')
      // Not an admin: official is refused whatever the value, even on one's own mission
      expect((await put(theirs, 'owner', { official: true })).statusCode).toBe(403)
      expect((await put(theirs, 'owner', { official: false })).statusCode).toBe(403)
      expect(await ownerOf(theirs)).toMatchObject({ owner_user_id: 'owner' })

      const up = await put(mine, 'admin', { official: true })
      expect(up.json()).toMatchObject({ official: true, author: null, visibility: 'public' })
      expect(await ownerOf(mine)).toEqual({ owner_user_id: null, visibility: 'public' })
      // Everyone sees and may no longer report it; only admins edit it
      expect((await call('GET', `/api/missions/${mine}`, 'stranger')).json()).toMatchObject({ official: true, canEdit: false })
      expect((await put(mine, 'mod', { visibility: 'public' })).statusCode).toBe(403)

      const down = await put(mine, 'admin', { official: false, visibility: 'friends' })
      expect(down.json()).toMatchObject({ official: false, author: { id: 'admin' }, visibility: 'friends', canEdit: true })
      expect(await ownerOf(mine)).toEqual({ owner_user_id: 'admin', visibility: 'friends' })
      // Left out, it stays as it is
      expect((await put(mine, 'admin', {})).json()).toMatchObject({ official: false })
    })

    it('refuses to make a hidden mission official until it is restored', async () => {
      const id = await createMission(db, 'admin', mission(), 'public')
      await db.updateTable('missions').set({ hidden_at: new Date(), hidden_reason: 'spam' }).where('id', '=', id).execute()
      expect((await put(id, 'admin', { official: true })).statusCode).toBe(409)
      expect(await ownerOf(id)).toMatchObject({ owner_user_id: 'admin' })
      expect((await call('POST', `/api/admin/missions/${id}/restore`, 'mod')).statusCode).toBe(204)
      expect((await put(id, 'admin', { official: true })).statusCode).toBe(200)
    })

    it('writes an audit row, and closes the reports of a promoted mission', async () => {
      const id = await createMission(db, 'admin', mission(), 'public')
      await db.insertInto('mission_reports').values({ id: 'r1', mission_id: id, reporter_user_id: 'stranger', reason: 'x' }).execute()
      await put(id, 'admin', { official: true })
      await put(id, 'admin', { official: false })
      const audit = await db.selectFrom('admin_audit').select(['admin_user_id', 'action', 'target']).orderBy('id').execute()
      expect(audit).toEqual([
        { admin_user_id: 'admin', action: 'mission.official', target: id },
        { admin_user_id: 'admin', action: 'mission.unofficial', target: id },
      ])
      expect((await db.selectFrom('mission_reports').select('dismissed_at').executeTakeFirstOrThrow()).dismissed_at).not.toBeNull()
    })

    it('an admin deletes an official mission, and it stays deleted', async () => {
      const id = await createMission(db, null, mission(), 'public')
      expect((await call('DELETE', `/api/missions/${id}`, 'mod')).statusCode).toBe(403)
      expect((await call('DELETE', `/api/missions/${id}`, 'admin')).statusCode).toBe(204)
      expect((await call('GET', '/api/missions', 'admin')).json()).toEqual({ missions: [] })
    })
  })

  it('refuses a mission the shared rules refuse, with where', async () => {
    const bad = { ...mission(), steps: [{ type: 'hit', targets: ['S20'], hits: 4, inARow: false, order: 'any', within: 'visit' }] }
    const res = await call('POST', '/api/missions', 'owner', { mission: bad, visibility: 'private' })
    expect(res.statusCode).toBe(400)
    expect(res.json().details[0].path).toBe('body/mission/steps/0/within')
  })

  it('caps the missions a player makes', async () => {
    await db
      .insertInto('missions')
      .values(
        Array.from({ length: 50 }, (_, i) => ({
          id: `m${i}`,
          owner_user_id: 'owner',
          visibility: 'private' as const,
          definition: JSON.stringify(mission()),
        })),
      )
      .execute()
    const res = await call('POST', '/api/missions', 'owner', { mission: mission(), visibility: 'private' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'limit reached' })
  })

  it('reports a public mission once; moderators hide and restore it, with an audit row', async () => {
    const id = await own('public')
    expect((await call('POST', `/api/missions/${id}/report`, 'stranger', { reason: 'rude name' })).statusCode).toBe(204)
    expect((await call('POST', `/api/missions/${id}/report`, 'stranger', { reason: 'again' })).statusCode).toBe(409)
    expect((await call('POST', `/api/missions/${id}/report`, 'owner', { reason: 'me' })).statusCode).toBe(409)
    expect((await call('POST', `/api/missions/${await own('friends')}/report`, 'friend', { reason: 'x' })).statusCode).toBe(404)

    expect((await call('GET', '/api/admin/missions/reports', 'stranger')).statusCode).toBe(403)
    const reports = (await call('GET', '/api/admin/missions/reports', 'mod')).json()
    expect(reports.reported).toMatchObject([{ mission: { id }, reports: [{ reporterName: 'Stan', reason: 'rude name' }] }])

    expect((await call('POST', `/api/admin/missions/${id}/hide`, 'stranger', { reason: 'x' })).statusCode).toBe(403)
    expect((await call('POST', `/api/admin/missions/${id}/hide`, 'mod', { reason: 'rude' })).statusCode).toBe(204)
    expect((await call('GET', `/api/missions/${id}`, 'stranger')).statusCode).toBe(404)
    expect((await call('GET', `/api/missions/${id}`, 'owner')).json().hidden).toMatchObject({ reason: 'rude' })
    const after = (await call('GET', '/api/admin/missions/reports', 'mod')).json()
    expect(after.reported).toEqual([])
    expect(after.hidden.map((m: { id: string }) => m.id)).toEqual([id])

    expect((await call('POST', `/api/admin/missions/${id}/restore`, 'mod')).statusCode).toBe(204)
    expect((await call('GET', `/api/missions/${id}`, 'stranger')).statusCode).toBe(200)
    const audit = await db.selectFrom('admin_audit').select(['action', 'target']).orderBy('id').execute()
    expect(audit).toEqual([
      { action: 'mission.hide', target: id },
      { action: 'mission.restore', target: id },
    ])
    // An official mission is the admins' own, not a moderator's to hide
    const official = await createMission(db, null, mission(), 'public')
    expect((await call('POST', `/api/admin/missions/${official}/hide`, 'mod', { reason: 'x' })).statusCode).toBe(404)
  })

  it('starts a game with a snapshot of the mission and its highscores; test runs only for the author', async () => {
    const id = await own('public')
    await db.insertInto('mission_bests').values({ mission_id: id, user_id: 'friend', time_ms: 61_000, darts: 9 }).execute()
    const res = await call('POST', `/api/missions/${id}/start`, 'stranger', {})
    expect(res.statusCode).toBe(201)
    expect(started[0]).toMatchObject({
      ownerUserId: 'stranger',
      gameId: 'mission',
      seats: [{ userId: 'stranger', controllerUserId: 'stranger', boardId: null, bot: null }],
      config: {
        missionId: id,
        test: false,
        mission: mission(),
        highscores: [{ userId: 'friend', name: 'Fred', timeMs: 61_000, darts: 9 }],
        bests: { stranger: null },
      },
    })
    expect((await call('POST', `/api/missions/${id}/start`, 'stranger', { test: true })).statusCode).toBe(403)
    expect((await call('POST', `/api/missions/${await own('private')}/start`, 'friend', {})).statusCode).toBe(404)
    const testRun = await call('POST', `/api/missions/${await own('private')}/start`, 'owner', { test: true })
    expect(testRun.statusCode).toBe(201)
    expect(started.at(-1)?.config).toMatchObject({ test: true })
    await db.updateTable('missions').set({ hidden_at: new Date(), hidden_reason: 'x' }).where('id', '=', id).execute()
    expect((await call('POST', `/api/missions/${id}/start`, 'owner', {})).statusCode).toBe(403)
    expect((await call('POST', `/api/missions/${id}/start`, 'owner', { test: true })).statusCode).toBe(201)
  })

  it('starts it for a lobby the user hosts: everyone who plays there takes turns; never a test run', async () => {
    const id = await own('friends')
    const res = await call('POST', `/api/missions/${id}/start`, 'friend', { lobbyId: 'L1' })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ sessionId: 'lobby-game' })
    expect(lobbyStarts).toEqual([
      {
        userId: 'friend',
        lobbyId: 'L1',
        force: false,
        game: { gameId: 'mission', config: expect.objectContaining({ missionId: id, test: false }) },
      },
    ])
    expect(started).toEqual([])
    expect((await call('POST', `/api/missions/${id}/start`, 'owner', { lobbyId: 'L1', test: true })).statusCode).toBe(400)
    // Who may not see the mission can't start it for a lobby either
    expect((await call('POST', `/api/missions/${id}/start`, 'stranger', { lobbyId: 'L1' })).statusCode).toBe(404)
  })

  it("stores each player's own best from the start, also one outside the top 10", async () => {
    const id = await own('public')
    const top = Array.from({ length: 10 }, (_, i) => `top${i}`)
    await insertUsers(db, top)
    await db
      .insertInto('mission_bests')
      .values([
        ...top.map((u, i) => ({ mission_id: id, user_id: u, time_ms: 30_000 + i, darts: 9 })),
        { mission_id: id, user_id: 'stranger', time_ms: 90_000, darts: 12 },
      ])
      .execute()
    expect((await call('POST', `/api/missions/${id}/start`, 'stranger', {})).statusCode).toBe(201)
    const solo = started.at(-1)?.config as { highscores: { userId: string }[]; bests: unknown }
    expect(solo.highscores.map(h => h.userId)).not.toContain('stranger')
    expect(solo.bests).toEqual({ stranger: { timeMs: 90_000, darts: 12 } })
    // A lobby: every account among its people (guests have none), null for one without a best
    await insertLobby(db, { id: 'L2', host_user_id: 'friend' })
    await db
      .insertInto('lobby_people')
      .values([
        { id: 'p1', lobby_id: 'L2', user_id: 'friend', added_by_user_id: 'friend', name: 'Fred', board_id: null, position: 0 },
        { id: 'p2', lobby_id: 'L2', user_id: 'stranger', added_by_user_id: 'stranger', name: 'Stan', board_id: null, position: 1 },
        { id: 'p3', lobby_id: 'L2', user_id: null, added_by_user_id: 'friend', name: 'Guest', board_id: null, position: 2 },
      ])
      .execute()
    expect((await call('POST', `/api/missions/${id}/start`, 'friend', { lobbyId: 'L2' })).statusCode).toBe(201)
    expect(lobbyStarts.at(-1)?.game.config).toMatchObject({ bests: { friend: null, stranger: { timeMs: 90_000, darts: 12 } } })
  })

  it('lists the highscores best first, by darts for a mission ranked by darts', async () => {
    const id = await own('public', mission({ rankBy: 'darts' }))
    await db
      .insertInto('mission_bests')
      .values([
        { mission_id: id, user_id: 'friend', time_ms: 50_000, darts: 30 },
        { mission_id: id, user_id: 'stranger', time_ms: 90_000, darts: 25 },
      ])
      .execute()
    const res = (await call('GET', `/api/missions/${id}/highscores`, 'mod')).json()
    expect(res.highscores.map((h: { name: string }) => h.name)).toEqual(['Stan', 'Fred'])
    const card = (await call('GET', `/api/missions/${id}`, 'owner')).json()
    expect(card).toMatchObject({ yourBest: null, friendsBest: { name: 'Fred', darts: 30 } })
  })
})
