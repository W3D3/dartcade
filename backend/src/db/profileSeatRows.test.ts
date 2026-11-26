// What the profile's per-mode stats read: only games that count.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { finishGameSession, insertGameSession } from './queries.js'
import { invalidateGame } from './adminGames.js'
import { seatRows } from './profile.js'
import { insertUsers } from '../test/fixtures.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('profile seat rows', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('profile_seat_rows'))
    await insertUsers(db, [
      { id: 'ann', name: 'Ann', emailVerified: true },
      { id: 'bob', name: 'Bob', emailVerified: true },
    ])
  })
  afterAll(async () => {
    await close()
  })
  beforeEach(async () => {
    await sql`TRUNCATE game_sessions CASCADE`.execute(db)
  })

  async function game(id: string, gameId: string, cfg: object = {}) {
    const ann = { name: 'Ann', user_id: 'ann', controller_user_id: 'ann', board_db_id: null, bot_level: null }
    const bob = { name: 'Bob', user_id: 'bob', controller_user_id: 'bob', board_db_id: null, bot_level: null }
    await insertGameSession(db, {
      id,
      owner_user_id: 'ann',
      board_db_id: null,
      game_id: gameId,
      game_version: 1,
      rng_seed: 0,
      config: cfg,
      players: [ann, bob],
    })
    await finishGameSession(db, id, new Date('2026-11-01T12:00:00Z'), [
      { placement: 1, stats: { count180: 2 }, throwPosition: 0, forfeited: false },
      { placement: 2, stats: {}, throwPosition: 1, forfeited: false },
    ])
  }

  it('returns the player’s own seat of every counting game, without invalidated, handicap and mission games', async () => {
    await game('g1', 'x01')
    await game('g2', 'cricket')
    await game('g3', 'x01')
    await game('g4', 'x01', { handicaps: [101, 501] })
    await game('g5', 'mission')
    await invalidateGame(db, 'g3', 'bob', 'test')
    const rows = await seatRows(db, 'ann')
    expect(rows.map(r => r.mode).sort()).toEqual(['cricket', 'x01'])
    expect(rows.find(r => r.mode === 'x01')).toEqual({ mode: 'x01', placement: 1, seats: 2, stats: { count180: 2 } })
    expect((await seatRows(db, 'bob')).find(r => r.mode === 'x01')?.placement).toBe(2)
  })
})
