import { useDbSingleton } from '../test/db.js'
import '../test/authByHeader.js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { adminActivityApiPlugin, CACHE_MS } from './adminActivity.js'
import { insertTournament, insertUsers } from '../test/fixtures.js'

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0)
const HOUR = 3_600_000
const live = { online: 7, runningGames: { x01: 2, cricket: 1 }, rankedQueue: 3, openLobbies: 4, bridges: 2, boardsOnline: 1 }

describe.skipIf(!process.env.TEST_DATABASE_URL)('GET /api/admin/activity', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let clock = NOW

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('admin_activity_api_test'))
    useDbSingleton(db)
    await insertUsers(db, [
      { id: 'admin', name: 'Admin', emailVerified: true, role: 'admin' },
      { id: 'mod', name: 'Mod', emailVerified: true, role: 'moderator' },
      { id: 'player', name: 'Player', emailVerified: true },
      { id: 'old', name: 'Old', emailVerified: true },
    ])
    const at = (id: string, ms: number) => sql`update "user" set "createdAt" = ${new Date(ms)} where id = ${id}`.execute(db)
    await at('admin', NOW - 30 * 86_400_000)
    await at('mod', NOW - 30 * 86_400_000)
    await at('player', NOW - 2 * 86_400_000)
    await at('old', NOW - 10 * 86_400_000)
    // two finished X01 games (one 2 h ago, one 3 days ago), a cricket game, a running one and an invalidated one
    const game = (id: string, game_id: string, status: string, ago: number, invalid = false) =>
      db
        .insertInto('game_sessions')
        .values({ id, game_id, config: '{}', status, owner_user_id: 'player' } as never)
        .execute()
        .then(() =>
          sql`update game_sessions set created_at = ${new Date(NOW - ago)}, finished_at = ${status === 'finished' ? new Date(NOW - ago) : null}, invalidated_at = ${invalid ? new Date(NOW) : null} where id = ${id}`.execute(
            db,
          ),
        )
    await game('g1', 'x01', 'finished', 2 * HOUR)
    await game('g2', 'x01', 'finished', 72 * HOUR)
    await game('g3', 'cricket', 'finished', 5 * HOUR)
    await game('g4', 'x01', 'active', HOUR)
    await game('g5', 'x01', 'finished', HOUR, true)
    await db
      .insertInto('game_players')
      .values([
        { session_id: 'g1', seat: 0, name: 'Player', user_id: 'player' },
        // seats of a running and an invalidated game are not counted
        { session_id: 'g4', seat: 0, name: 'Mod', user_id: 'mod' },
        { session_id: 'g5', seat: 0, name: 'Admin', user_id: 'admin' },
      ] as never)
      .execute()
    await insertTournament(db, { id: 't1', owner_user_id: 'admin', kind: 'official', status: 'running', name: 'Midweek' } as never)
  })
  afterAll(async () => {
    await close()
  })

  async function get(user?: string, query = '') {
    const app = createFastify()
    await app.register(adminActivityApiPlugin, { db, live: () => Promise.resolve(live), now: () => clock })
    return app.inject({ method: 'GET', url: `/api/admin/activity${query}`, headers: user ? { 'x-user': user } : {} })
  }

  it('401s signed out and 403s a player or a moderator', async () => {
    expect((await get()).statusCode).toBe(401)
    expect((await get('player')).statusCode).toBe(403)
    expect((await get('mod')).statusCode).toBe(403)
  })

  it('400s a range that is not offered', async () => {
    expect((await get('admin', '?days=5')).statusCode).toBe(400)
  })

  it('counts signups, games and what is live, leaving out invalidated and unfinished games', async () => {
    const res = await get('admin', '?days=7')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.days).toBe(7)
    expect(body.live).toEqual({ online: 7, runningGames: 3 })
    expect(body.last24h).toMatchObject({ players: 1, games: 2, oneEighties: 0 })
    expect(body.newUsers).toEqual({ last7d: 1, previous7d: 1 })
    expect(body.newUsersPerDay).toHaveLength(7)
    expect(body.newUsersPerDay.at(-3)).toBe(1)
    expect(body.gamesPerDay.modes).toEqual(['x01', 'cricket'])
    expect(body.gamesPerDay.perDay.at(-1)).toEqual({ x01: 1, cricket: 1 })
    expect(body.gamesPerDay.perDay.at(-4)).toEqual({ x01: 1 })
    expect(body.busiest).toHaveLength(7)
    expect(body.busiest.flat().reduce((a: number, b: number) => a + b, 0)).toBe(3)
    expect(body.happeningNow).toMatchObject({ rankedQueue: 3, openLobbies: 4, runningGames: { x01: 2, cricket: 1 } })
    expect(body.happeningNow.tournaments).toEqual([{ id: 't1', name: 'Midweek', official: true, status: 'running', entries: 0 }])
    expect(body.health).toEqual({ bridges: 2, boardsOnline: 1, manualDartShare: null })
  })

  it('reuses the table counts for a few seconds, then asks again', async () => {
    const app = createFastify()
    await app.register(adminActivityApiPlugin, { db, live: () => Promise.resolve(live), now: () => clock })
    const read = async () => (await app.inject({ method: 'GET', url: '/api/admin/activity', headers: { 'x-user': 'admin' } })).json()
    const first = await read()
    await db.deleteFrom('game_players').execute()
    expect((await read()).last24h).toEqual(first.last24h)
    clock += CACHE_MS
    expect((await read()).last24h.players).toBe(0)
  })
})
