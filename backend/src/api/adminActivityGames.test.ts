import { useDbSingleton } from '../test/db.js'
import '../test/authByHeader.js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { adminActivityApiPlugin } from './adminActivity.js'
import { insertUsers } from '../test/fixtures.js'

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0)
const DAY = 86_400_000

describe.skipIf(!process.env.TEST_DATABASE_URL)('GET /api/admin/activity/games', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('admin_activity_games_test'))
    useDbSingleton(db)
    await insertUsers(db, [
      { id: 'admin', name: 'Admin', emailVerified: true, role: 'admin' },
      { id: 'mod', name: 'Mod', emailVerified: true, role: 'moderator' },
      { id: 'at1', name: 'Anna', emailVerified: true },
      { id: 'at2', name: 'Arno', emailVerified: true },
      { id: 'de1', name: 'Dirk', emailVerified: true },
      { id: 'nc1', name: 'Nora', emailVerified: true },
    ])
    for (const [id, country] of [
      ['at1', 'AT'],
      ['at2', 'AT'],
      ['de1', 'DE'],
    ]) {
      await sql`update "user" set country = ${country} where id = ${id}`.execute(db)
    }
    const game = async (id: string, game_id: string, status: string, ago: number, seats: (string | null)[], invalid = false) => {
      await db.insertInto('game_sessions').values({ id, game_id, config: '{}', status, owner_user_id: 'admin' }).execute()
      await sql`update game_sessions set created_at = ${new Date(NOW - ago)}, invalidated_at = ${invalid ? new Date(NOW) : null} where id = ${id}`.execute(
        db,
      )
      await db
        .insertInto('game_players')
        .values(seats.map((u, seat) => ({ session_id: id, seat, name: u ?? 'Guest', user_id: u })))
        .execute()
    }
    await game('a', 'x01', 'finished', 0, ['at1', 'de1'])
    await game('b', 'x01', 'finished', DAY, ['at1', 'at2'])
    await game('c', 'cricket', 'finished', 2 * DAY, ['at2', null, 'nc1'])
    await game('d', 'x01', 'aborted', 2 * DAY, ['de1'])
    await game('e', 'x01', 'finished', 3 * DAY, ['at1'], true)
  })
  afterAll(async () => {
    await close()
  })

  async function get(query: string, user = 'admin', path = '/api/admin/activity/games') {
    const app = createFastify()
    await app.register(adminActivityApiPlugin, { db, live: () => Promise.reject(new Error('unused')), now: () => NOW })
    return app.inject({ method: 'GET', url: `${path}${query}`, headers: { 'x-user': user } })
  }
  const ids = async (query: string): Promise<string[]> => (await get(query)).json().games.map((g: { id: string }) => g.id)

  it('is admin only', async () => {
    expect((await get('', 'mod')).statusCode).toBe(403)
    expect((await get('', 'mod', '/api/admin/activity/games.csv')).statusCode).toBe(403)
  })

  it('lists finished, non-invalidated games newest first with a per-day series', async () => {
    const body = (await get('')).json()
    expect(body.games.map((g: { id: string }) => g.id)).toEqual(['a', 'b', 'c'])
    expect(body.total).toBe(3)
    expect(body.csvMax).toBe(50_000)
    expect(body.perDay).toEqual([
      { day: '2026-11-13', count: 1 },
      { day: '2026-11-14', count: 1 },
      { day: '2026-11-15', count: 1 },
    ])
  })

  it('includes or excludes users and names them back', async () => {
    expect(await ids('?usersIn=de1')).toEqual(['a'])
    expect(await ids('?usersIn=at2,nc1')).toEqual(['b', 'c'])
    expect(await ids('?usersOut=de1')).toEqual(['b', 'c'])
    expect((await get('?usersIn=de1&usersOut=nc1')).json().users).toEqual(
      expect.arrayContaining([
        { id: 'de1', name: 'Dirk' },
        { id: 'nc1', name: 'Nora' },
      ]),
    )
  })

  it('filters by country, any or all seated accounts, and by no country', async () => {
    expect(await ids('?countriesIn=DE')).toEqual(['a'])
    expect(await ids('?countriesIn=AT')).toEqual(['a', 'b', 'c'])
    expect(await ids('?countriesIn=AT&countryMatch=all')).toEqual(['b'])
    expect(await ids('?countriesIn=none')).toEqual(['c'])
    expect(await ids('?countriesOut=DE')).toEqual(['b', 'c'])
    expect(await ids('?countriesOut=none')).toEqual(['a', 'b'])
  })

  it('filters by seat count, mode, status, dates and invalidation', async () => {
    expect(await ids('?minPlayers=3')).toEqual(['c'])
    expect(await ids('?minPlayers=2&maxPlayers=2')).toEqual(['a', 'b'])
    expect(await ids('?modes=cricket')).toEqual(['c'])
    expect(await ids('?status=aborted')).toEqual(['d'])
    expect(await ids('?status=all')).toEqual(['a', 'b', 'd', 'c'])
    expect(await ids(`?from=${new Date(NOW - DAY / 2).toISOString()}`)).toEqual(['a'])
    expect(await ids('?includeInvalidated=true')).toEqual(['a', 'b', 'c', 'e'])
    expect(await ids('?kind=ranked')).toEqual([])
    expect(await ids('?kind=local')).toEqual(['a', 'b', 'c'])
  })

  it('pages the table', async () => {
    const body = (await get('?page=2')).json()
    expect(body).toMatchObject({ page: 2, total: 3, games: [] })
  })

  it('exports the same games as CSV', async () => {
    const res = await get('?countriesIn=DE', 'admin', '/api/admin/activity/games.csv')
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.body.split('\n')).toEqual([
      'id,mode,status,started_at,finished_at,ranked,invalidated,players,countries',
      'a,x01,finished,2026-11-15T12:00:00.000Z,,false,false,at1 | de1,AT | DE',
      '',
    ])
  })
})
