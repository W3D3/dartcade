import '../test/authByHeader.js'
import { useDbSingleton } from '../test/db.js'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertUsers } from '../test/fixtures.js'
import { createMission, seedOfficialMissions } from '../db/missions.js'
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
  })

  function app() {
    const a = createFastify()
    a.register(missionsApiPlugin, { db, engine })
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

  it('filters Mine, From friends and difficulty, and lists the official missions for everyone', async () => {
    await seedOfficialMissions(db)
    const hard = await own('friends', mission({ difficulty: 'hard' }))
    const mine = (await call('GET', '/api/missions?filter=mine', 'owner')).json().missions
    expect(mine.map((m: { id: string }) => m.id)).toEqual([hard])
    const fromFriends = (await call('GET', '/api/missions?filter=friends', 'friend')).json().missions
    expect(fromFriends.map((m: { id: string }) => m.id)).toEqual([hard])
    const all = (await call('GET', '/api/missions', 'stranger')).json().missions
    expect(all.every((m: { official: boolean }) => m.official)).toBe(true)
    expect(all.length).toBe(6)
    const hards = (await call('GET', '/api/missions?difficulty=hard', 'friend')).json().missions.map((m: { id: string }) => m.id)
    expect(hards).toContain(hard)
    expect(hards).toContain('official-tungsten-gauntlet')
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

    expect((await call('POST', '/api/admin/missions', 'mod', { mission: mission() })).statusCode).toBe(403)
    const official = await call('POST', '/api/admin/missions', 'admin', { mission: mission() })
    expect(official.json()).toMatchObject({ official: true, author: null, visibility: 'public' })
    const oid = official.json().id
    expect((await call('PUT', `/api/missions/${oid}`, 'stranger', { mission: mission(), visibility: 'private' })).statusCode).toBe(403)
    // An official mission stays everyone's whatever the body says
    expect((await call('PUT', `/api/missions/${oid}`, 'admin', { mission: mission(), visibility: 'private' })).json().visibility).toBe(
      'public',
    )
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
    await seedOfficialMissions(db)
    expect((await call('POST', '/api/admin/missions/official-bull-rush/hide', 'mod', { reason: 'x' })).statusCode).toBe(404)
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
