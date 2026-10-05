import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { runMigrations, insertGameSession, finishGameSession, abortGameSession, insertBoard } from './queries.js'
import { listFinishedGames, getStatRows, getViewableGame } from './history.js'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? ''
// Own schema: Vitest runs test files in parallel, and queries.test.ts wipes the shared tables
const SCHEMA = 'history_test'

describe.skipIf(!process.env.TEST_DATABASE_URL)('history queries', () => {
  let admin: Kysely<Database>
  let db: Kysely<Database>
  const t = (min: number) => new Date(Date.UTC(2026, 9, 1, 10, min))

  async function game(
    id: string,
    mode: string,
    owner: string,
    seats: { name: string; user_id: string | null }[],
    finishedAt: Date | 'abort' | 'active',
    board: string | null = null,
    forfeitedSeats: number[] = [],
  ) {
    await insertGameSession(db, {
      id,
      owner_user_id: owner,
      board_db_id: board,
      game_id: mode,
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: seats.map(s => ({ ...s, controller_user_id: owner, board_db_id: null })),
    })
    if (finishedAt === 'abort') await abortGameSession(db, id, t(0))
    else if (finishedAt !== 'active')
      await finishGameSession(
        db,
        id,
        finishedAt,
        seats.map((_, i) => ({
          placement: i + 1,
          stats: { dartsThrown: 10 + i },
          throwPosition: seats.length - 1 - i,
          forfeited: forfeitedSeats.includes(i),
        })),
      )
  }

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA}`)
    await runMigrations(db)
    await db
      .insertInto('user')
      .values([
        { id: 'u1', name: 'One', email: 'one@example.com', emailVerified: false, image: null },
        { id: 'u2', name: 'Two', email: 'two@example.com', emailVerified: false, image: null },
      ])
      .execute()
    await insertBoard(db, { id: 'b1', owner_user_id: 'u1', name: 'Living room', token_hash: 'h-b1' })
    await game(
      'x-1',
      'x01',
      'u1',
      [
        { name: 'One', user_id: 'u1' },
        { name: 'Guest', user_id: null },
      ],
      t(1),
      'b1',
      [1],
    )
    await game('a-1', 'atc', 'u1', [{ name: 'One', user_id: 'u1' }], t(2))
    await game(
      'x-2',
      'x01',
      'u1',
      [
        { name: 'One', user_id: 'u1' },
        { name: 'Guest', user_id: null },
      ],
      t(3),
    )
    await game('x-aborted', 'x01', 'u1', [{ name: 'One', user_id: 'u1' }], 'abort')
    await game('x-running', 'x01', 'u1', [{ name: 'One', user_id: 'u1' }], 'active')
    await game('x-other', 'x01', 'u2', [{ name: 'Two', user_id: 'u2' }], t(4))
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('lists my finished games newest first, with seats and board', async () => {
    const { games, next } = await listFinishedGames(db, 'u1', { limit: 10, after: null })
    expect(games.map(g => g.id)).toEqual(['x-2', 'a-1', 'x-1'])
    expect(next).toBeNull()
    expect(games[2]).toMatchObject({ board: { id: 'b1', name: 'Living room' }, mySeat: 0, finished_at: t(1) })
    expect(games[2].seats.map(s => [s.name, s.placement, s.throw_position, s.stats, s.forfeited])).toEqual([
      ['One', 1, 1, { dartsThrown: 10 }, false],
      ['Guest', 2, 0, { dartsThrown: 11 }, true],
    ])
  })

  it('filters by mode and pages with the cursor', async () => {
    const p1 = await listFinishedGames(db, 'u1', { mode: 'x01', limit: 1, after: null })
    expect(p1.games.map(g => g.id)).toEqual(['x-2'])
    const p2 = await listFinishedGames(db, 'u1', { mode: 'x01', limit: 1, after: p1.next })
    expect(p2.games.map(g => g.id)).toEqual(['x-1'])
    expect(p2.next).toBeNull()
  })

  it('stat rows: my seat, placed games since the date, seat count', async () => {
    const rows = await getStatRows(db, 'u1', t(2))
    expect(rows.map(r => [r.mode, r.placement, r.seats, r.stats])).toEqual(
      expect.arrayContaining([
        ['atc', 1, 1, { dartsThrown: 10 }],
        ['x01', 1, 2, { dartsThrown: 10 }],
      ]),
    )
    expect(rows).toHaveLength(2)
  })

  it('a game is viewable by its seats; private games are 404 for others until public', async () => {
    expect((await getViewableGame(db, 'x-1', 'u1'))?.mySeat).toBe(0)
    expect(await getViewableGame(db, 'x-1', 'u2')).toBeUndefined()
    await db.updateTable('game_sessions').set({ visibility: 'public' }).where('id', '=', 'x-1').execute()
    expect((await getViewableGame(db, 'x-1', 'u2'))?.mySeat).toBeNull()
    expect(await getViewableGame(db, 'x-aborted', 'u1')).toBeUndefined()
    expect(await getViewableGame(db, 'x-running', 'u1')).toBeUndefined()
  })
})
