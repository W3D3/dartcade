import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { runMigrations, insertGameSession, finishGameSession, abortGameSession } from './queries.js'
import { listAllGames, type AdminGameFilter } from './adminGames.js'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? ''
const SCHEMA = 'admin_games_test'

describe.skipIf(!process.env.TEST_DATABASE_URL)('admin game queries', () => {
  let admin: Kysely<Database>
  let db: Kysely<Database>
  const t = (min: number) => new Date(Date.UTC(2026, 9, 1, 10, min))

  async function game(
    id: string,
    mode: string,
    names: [string, string | null][],
    state: 'finished' | 'aborted' | 'active',
    startMin: number,
  ) {
    await insertGameSession(db, {
      id,
      owner_user_id: 'u1',
      board_db_id: null,
      game_id: mode,
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: names.map(([name, user_id]) => ({ name, user_id, controller_user_id: 'u1', board_db_id: null, bot_level: null })),
    })
    await sql`UPDATE game_sessions SET created_at = ${t(startMin)} WHERE id = ${id}`.execute(db)
    if (state === 'aborted') await abortGameSession(db, id, t(startMin + 1))
    if (state === 'finished') {
      await finishGameSession(
        db,
        id,
        t(startMin + 5),
        names.map((_, i) => ({ placement: i + 1, stats: {}, throwPosition: i, forfeited: false })),
      )
    }
  }
  const ids = (r: { games: { id: string }[] }) => r.games.map(g => g.id)

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA}`)
    await runMigrations(db)
    await db
      .insertInto('user')
      .values([
        { id: 'u1', name: 'Ann', email: 'ann@example.com', emailVerified: true, image: null, role: null },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', emailVerified: true, image: null, role: null },
      ])
      .execute()
    await game(
      'g1',
      'x01',
      [
        ['Ann', 'u1'],
        ['Bob', 'u2'],
      ],
      'finished',
      0,
    )
    await game('g2', 'atc', [['Bob', 'u2']], 'finished', 10)
    await game(
      'g3',
      'x01',
      [
        ['Ann', 'u1'],
        ['Guest 100%', null],
      ],
      'aborted',
      20,
    )
    await game('g4', 'x01', [['Ann', 'u1']], 'active', 30)
    await db
      .insertInto('ranked_results')
      .values({
        session_id: 'g1',
        user_id: 'u1',
        mode: '1v1',
        won: true,
        placement: false,
        rating_before: 1200,
        rating_after: 1220,
        average: 50,
      })
      .execute()
  })
  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('lists finished games of everyone by default, newest started first, with all seats', async () => {
    const r = await listAllGames(db, { status: 'finished' }, { limit: 25, after: null })
    expect(ids(r)).toEqual(['g2', 'g1'])
    expect(r.games[1]?.seats.map(s => [s.name, s.user_id, s.placement])).toEqual([
      ['Ann', 'u1', 1],
      ['Bob', 'u2', 2],
    ])
    expect(r.games[1]).toMatchObject({ status: 'finished', ranked: true })
    expect(r.games[0]).toMatchObject({ ranked: false })
  })

  it('shows aborted and active games on request, with no result on their seats', async () => {
    expect(ids(await listAllGames(db, { status: 'aborted' }, { limit: 25, after: null }))).toEqual(['g3'])
    const all = await listAllGames(db, { status: 'all' }, { limit: 25, after: null })
    expect(ids(all)).toEqual(['g4', 'g3', 'g2', 'g1'])
    expect(all.games[0]).toMatchObject({ status: 'active', finished_at: null })
    expect(all.games[1]?.seats.every(s => s.placement === null)).toBe(true)
  })

  it('filters by mode, player (name or account id, wildcards literal), ranked and start time', async () => {
    const q = (f: Partial<AdminGameFilter>) => listAllGames(db, { status: 'all', ...f }, { limit: 25, after: null }).then(ids)
    expect(await q({ mode: 'atc' })).toEqual(['g2'])
    expect(await q({ player: 'ann' })).toEqual(['g4', 'g3', 'g1'])
    expect(await q({ player: 'u2' })).toEqual(['g2', 'g1'])
    expect(await q({ player: '100%' })).toEqual(['g3'])
    expect(await q({ player: '%' })).toEqual(['g3'])
    expect(await q({ ranked: true })).toEqual(['g1'])
    expect(await q({ from: t(10), to: t(30) })).toEqual(['g3', 'g2'])
  })

  it('pages with a cursor', async () => {
    const first = await listAllGames(db, { status: 'all' }, { limit: 3, after: null })
    expect(ids(first)).toEqual(['g4', 'g3', 'g2'])
    expect(first.next).not.toBeNull()
    const second = await listAllGames(db, { status: 'all' }, { limit: 3, after: first.next })
    expect(ids(second)).toEqual(['g1'])
    expect(second.next).toBeNull()
  })
})
