// The Stats page's queries: which of a player's X01 games it reads, under its filters and range.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { finishGameSession, insertGameSession } from './queries.js'
import { countX01StatLegs, listX01StatGames, x01StatOptions, type X01StatFilter } from './history.js'
import { invalidateGame } from './adminGames.js'

const config = { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 1, bullOff: 'off', bullValue: '25_50', maxRounds: 50 }
const DOUBLE_501: X01StatFilter = { start: 501, out: 'double', kind: 'all' }

describe.skipIf(!process.env.TEST_DATABASE_URL)('X01 stat games', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('x01_stat_games'))
    await db
      .insertInto('user')
      .values([
        { id: 'ann', name: 'Ann', email: 'ann@example.com', emailVerified: true, image: null },
        { id: 'bob', name: 'Bob', email: 'bob@example.com', emailVerified: true, image: null },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })
  beforeEach(async () => {
    await sql`TRUNCATE game_sessions CASCADE`.execute(db)
  })

  /** A finished X01 game of Ann's: alone, against Bob, or against a bot; `cfg` changes its rules. */
  async function game(id: string, finished: string, opts: { with?: 'bob' | 'bot'; cfg?: object; game?: string } = {}) {
    const ann = { name: 'Ann', user_id: 'ann', controller_user_id: 'ann', board_db_id: null, bot_level: null }
    const other =
      opts.with === 'bob'
        ? [{ name: 'Bob', user_id: 'bob', controller_user_id: 'bob', board_db_id: null, bot_level: null }]
        : opts.with === 'bot'
          ? [{ name: 'Bot', user_id: null, controller_user_id: 'ann', board_db_id: null, bot_level: 5 }]
          : []
    await insertGameSession(db, {
      id,
      owner_user_id: 'ann',
      board_db_id: null,
      game_id: opts.game ?? 'x01',
      game_version: 1,
      rng_seed: 0,
      config: { ...config, ...opts.cfg },
      players: [ann, ...other],
    })
    await finishGameSession(
      db,
      id,
      new Date(finished),
      [ann, ...other].map((_, i) => ({ placement: i + 1, stats: {}, throwPosition: i, forfeited: false })),
    )
  }
  const ids = async (f: X01StatFilter, w: { since?: Date; limit?: number } = {}) => (await listX01StatGames(db, 'ann', f, w)).map(g => g.id)

  it('lists the player’s games under the filter, newest first, leaving out invalidated ones and other modes', async () => {
    await game('a', '2026-11-01T20:00:00Z', { with: 'bob' })
    await game('b', '2026-11-03T20:00:00Z')
    await game('c', '2026-11-02T20:00:00Z', { cfg: { startScore: 301 } })
    await game('d', '2026-11-04T20:00:00Z', { cfg: { outMode: 'straight' } })
    await game('e', '2026-11-05T20:00:00Z', { game: 'atc' })
    await game('f', '2026-11-06T20:00:00Z')
    await invalidateGame(db, 'f', 'ann', null)
    expect(await ids(DOUBLE_501)).toEqual(['b', 'a'])
    expect(await ids({ ...DOUBLE_501, start: 301 })).toEqual(['c'])
    expect((await listX01StatGames(db, 'ann', DOUBLE_501, {}))[1]).toMatchObject({
      mySeat: 0,
      ranked: false,
      seats: [{ name: 'Ann' }, { name: 'Bob' }],
    })
  })

  it('reads a config without the rules as X01’s defaults: 501, double out', async () => {
    await game('old', '2026-11-01T20:00:00Z', { cfg: { startScore: undefined, outMode: undefined } })
    expect(await ids(DOUBLE_501)).toEqual(['old'])
  })

  it('tells ranked, solo, bot and casual games apart', async () => {
    await game('solo', '2026-11-01T20:00:00Z')
    await game('bot', '2026-11-02T20:00:00Z', { with: 'bot' })
    await game('casual', '2026-11-03T20:00:00Z', { with: 'bob' })
    await game('ranked', '2026-11-04T20:00:00Z', { with: 'bob' })
    await db
      .insertInto('ranked_matches')
      .values({ session_id: 'ranked', mode: '1v1', sides: JSON.stringify([['ann'], ['bob']]), void_reason: null })
      .execute()
    expect(await ids({ ...DOUBLE_501, kind: 'solo' })).toEqual(['solo'])
    expect(await ids({ ...DOUBLE_501, kind: 'bots' })).toEqual(['bot'])
    expect(await ids({ ...DOUBLE_501, kind: 'casual' })).toEqual(['casual'])
    expect(await ids({ ...DOUBLE_501, kind: 'ranked' })).toEqual(['ranked'])
    expect((await listX01StatGames(db, 'ann', { ...DOUBLE_501, kind: 'ranked' }, {}))[0].ranked).toBe(true)
  })

  it('reads only what the range needs', async () => {
    for (const d of ['01', '02', '03', '04']) await game(`g${d}`, `2026-11-${d}T20:00:00Z`)
    expect(await ids(DOUBLE_501, { limit: 2 })).toEqual(['g04', 'g03'])
    expect(await ids(DOUBLE_501, { since: new Date('2026-11-03T00:00:00Z') })).toEqual(['g04', 'g03'])
  })

  it('offers the start scores and out rules played, the most played first', async () => {
    await game('a', '2026-11-01T20:00:00Z', { cfg: { startScore: 301 } })
    await game('b', '2026-11-02T20:00:00Z', { cfg: { startScore: 301, outMode: 'straight' } })
    await game('c', '2026-11-03T20:00:00Z')
    expect(await x01StatOptions(db, 'ann')).toEqual({ starts: [301, 501], outs: ['double', 'straight'] })
    expect(await x01StatOptions(db, 'bob')).toEqual({ starts: [], outs: [] })
  })

  it('counts the legs of the games whose detail is stored', async () => {
    await game('a', '2026-11-01T20:00:00Z')
    await game('b', '2026-11-02T20:00:00Z')
    await db
      .insertInto('game_details')
      .values({ session_id: 'a', version: '1', detail: JSON.stringify({ mode: 'x01', legs: [{}, {}, {}] }), stats: '{}' })
      .execute()
    expect(await countX01StatLegs(db, 'ann', DOUBLE_501)).toBe(3)
    expect(await countX01StatLegs(db, 'ann', { ...DOUBLE_501, kind: 'bots' })).toBe(0)
  })
})
