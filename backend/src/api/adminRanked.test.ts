import '../test/authByHeader.js'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { adminRankedApiPlugin } from './adminRanked.js'

// requireModerator reads the db singleton: point it at the test schema
const dbRef = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../db/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../db/index.js')>()
  return {
    ...actual,
    get db() {
      return dbRef.current
    },
  }
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('admin ranked API', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  const sessions = new Map<string, { id: string; status: string; ranked: unknown }>()
  const engine = {
    getSession: vi.fn((id: string) => sessions.get(id) as never),
    voidSession: vi.fn((id: string) => {
      const s = sessions.get(id)
      if (s) s.status = 'aborted'
      return Promise.resolve(true)
    }),
  }
  const matchmaking = {
    searchList: vi.fn(() => [
      {
        id: 's1',
        mode: '1v1' as const,
        firstTo: 2 as const,
        since: '2026-11-07T10:00:00.000Z',
        waitSeconds: 42,
        range: 100,
        rating: 1310,
        placing: false,
        players: [{ userId: 'player', name: 'Player' }],
      },
    ]),
    dequeue: vi.fn((userId: string) => Promise.resolve(userId === 'player' ? { mode: '1v1' as const, userIds: ['player'] } : null)),
  }
  const app = () => {
    const a = createFastify()
    a.register(adminRankedApiPlugin, { db, engine, matchmaking })
    return a
  }
  const as = (id: string) => ({ 'x-user': id })

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('admin_ranked_api_test'))
    dbRef.current = db
    await db
      .insertInto('user')
      .values([
        { id: 'admin', name: 'Admin', email: 'a@x', emailVerified: true, image: null, role: 'admin' },
        { id: 'mod', name: 'Mod', email: 'm@x', emailVerified: true, image: null, role: 'moderator' },
        { id: 'player', name: 'Player', email: 'p@x', emailVerified: true, image: null, role: null },
      ])
      .execute()
    await db
      .insertInto('game_sessions')
      .values({ id: 'run1', owner_user_id: null, board_db_id: null, game_id: 'x01', config: '{}', status: 'active' })
      .execute()
    await db
      .insertInto('game_players')
      .values({
        session_id: 'run1',
        seat: 0,
        name: 'Player',
        user_id: 'player',
        placement: null,
        forfeited: false,
        stats: '{}',
        throw_position: 0,
        controller_user_id: 'player',
        board_db_id: null,
        bot_level: null,
      })
      .execute()
    await db
      .insertInto('ranked_matches')
      .values({ session_id: 'run1', mode: '1v1', sides: JSON.stringify([['player'], ['x']]) })
      .execute()
    sessions.set('run1', { id: 'run1', status: 'active', ranked: {} })
    sessions.set('casual', { id: 'casual', status: 'active', ranked: null })
  })
  afterAll(async () => {
    await close()
  })

  const routes = [
    { method: 'POST', url: '/api/admin/games/run1/void', payload: {} },
    { method: 'GET', url: '/api/admin/ranked/queue' },
    { method: 'POST', url: '/api/admin/ranked/queue/player/remove', payload: {} },
  ] as const

  it('refuses a player (403) and a signed-out caller (401) on every route', async () => {
    for (const r of routes) {
      expect((await app().inject({ ...r, headers: as('player') })).statusCode).toBe(403)
      expect((await app().inject({ ...r })).statusCode).toBe(401)
    }
    expect(engine.voidSession).not.toHaveBeenCalled()
    expect(matchmaking.dequeue).not.toHaveBeenCalled()
  })

  it('lets a moderator see the queue', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/admin/ranked/queue', headers: as('mod') })
    expect(res.statusCode).toBe(200)
    expect(res.json().searches[0]).toMatchObject({ mode: '1v1', waitSeconds: 42, rating: 1310 })
  })

  it('removes someone from the queue and audits it; 404 when they are not queued', async () => {
    const gone = await app().inject({ method: 'POST', url: '/api/admin/ranked/queue/ghost/remove', headers: as('mod'), payload: {} })
    expect(gone.statusCode).toBe(404)
    const res = await app().inject({
      method: 'POST',
      url: '/api/admin/ranked/queue/player/remove',
      headers: as('mod'),
      payload: { reason: ' stuck search ' },
    })
    expect(res.statusCode).toBe(204)
    const audit = await db.selectFrom('admin_audit').selectAll().where('action', '=', 'ranked.dequeue').execute()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ admin_user_id: 'mod', target: 'player', detail: { mode: '1v1', reason: 'stuck search' } })
  })

  it('does not void a game that is not a running ranked one', async () => {
    const missing = await app().inject({ method: 'POST', url: '/api/admin/games/nope/void', headers: as('mod'), payload: {} })
    expect(missing.statusCode).toBe(404)
    const casual = await app().inject({ method: 'POST', url: '/api/admin/games/casual/void', headers: as('mod'), payload: {} })
    expect(casual.statusCode).toBe(409)
    expect(engine.voidSession).not.toHaveBeenCalled()
  })

  it('does not mark a game void that ended before the void ran', async () => {
    sessions.set('race', { id: 'race', status: 'active', ranked: {} })
    engine.voidSession.mockResolvedValueOnce(false)
    const res = await app().inject({ method: 'POST', url: '/api/admin/games/race/void', headers: as('mod'), payload: {} })
    expect(res.statusCode).toBe(409)
    expect(await db.selectFrom('admin_audit').select('id').where('target', '=', 'race').execute()).toEqual([])
  })

  it('voids a running ranked game: aborted by nobody, marked void, audited with the reason', async () => {
    const res = await app().inject({
      method: 'POST',
      url: '/api/admin/games/run1/void',
      headers: as('admin'),
      payload: { reason: 'board fault' },
    })
    expect(res.statusCode).toBe(204)
    expect(engine.voidSession).toHaveBeenCalledWith('run1')
    expect((await db.selectFrom('ranked_matches').select('void_reason').executeTakeFirstOrThrow()).void_reason).toBe('moderator_void')
    const audit = await db.selectFrom('admin_audit').selectAll().where('action', '=', 'ranked.void').executeTakeFirstOrThrow()
    expect(audit).toMatchObject({ admin_user_id: 'admin', target: 'run1', detail: { mode: '1v1', reason: 'board fault' } })
    // Already ended: a second void is refused
    expect((await app().inject({ method: 'POST', url: '/api/admin/games/run1/void', headers: as('admin'), payload: {} })).statusCode).toBe(
      409,
    )
  })

  it('lists a running ranked game as ranked, and a voided one as voided', async () => {
    const { listAllGames } = await import('../db/adminGames.js')
    const page = await listAllGames(db, { status: 'all', ranked: true }, { limit: 10, after: null })
    expect(page.games.map(g => [g.id, g.ranked, g.voided])).toEqual([['run1', true, true]])
  })
})
