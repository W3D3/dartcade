// Issue #355: a finished game's detail is built once and stored, not replayed on every load
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { finishGameSession, insertGameSession } from '../db/queries.js'
import { getFinishedGame, getViewableGame } from '../db/history.js'
import { deleteGame, invalidateGame } from '../db/adminGames.js'
import { replayPooled } from '../session/replay.js'
import { storedDetail } from './detail.js'

vi.mock('../session/replay.js', async orig => {
  const m = await orig<typeof import('../session/replay.js')>()
  return { ...m, replayPooled: vi.fn(m.replayPooled) }
})

const config = { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 1, bullOff: 'off', bullValue: '25_50', maxRounds: 50 }

describe.skipIf(!process.env.TEST_DATABASE_URL)('storedDetail', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('stored_detail'))
    await db.insertInto('user').values({ id: 'ann', name: 'Ann', email: 'ann@example.com', emailVerified: true, image: null }).execute()
  })
  afterAll(async () => {
    await close()
  })
  beforeEach(async () => {
    vi.mocked(replayPooled).mockClear()
    await sql`TRUNCATE game_sessions CASCADE`.execute(db)
    await insertGameSession(db, {
      id: 'g1',
      owner_user_id: 'ann',
      board_db_id: null,
      game_id: 'x01',
      game_version: 1,
      rng_seed: 0,
      config,
      players: [{ name: 'Ann', user_id: 'ann', controller_user_id: 'ann', board_db_id: null, bot_level: null }],
    })
    await finishGameSession(db, 'g1', new Date(), [{ placement: 1, stats: {}, throwPosition: 0, forfeited: false }])
  })

  const load = async () => storedDetail(db, (await getFinishedGame(db, 'g1'))!, vi.fn())
  const stored = () => db.selectFrom('game_details').selectAll().where('session_id', '=', 'g1').executeTakeFirst()

  it('replays a game once, then serves the stored detail', async () => {
    expect(await stored()).toBeUndefined()
    const first = await load()
    expect(first?.detail).toMatchObject({ mode: 'x01' })
    expect(await stored()).toBeDefined()
    expect(await load()).toEqual(first)
    expect(replayPooled).toHaveBeenCalledTimes(1)
  })

  it('replays once for two loads at the same time', async () => {
    const game = (await getFinishedGame(db, 'g1'))!
    // A slow replay, so the second load looks before the first one has stored anything
    const { replayPooled: real } = await vi.importActual<typeof import('../session/replay.js')>('../session/replay.js')
    vi.mocked(replayPooled).mockImplementationOnce(async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 200))
      return real(...args)
    })
    const [a, b] = await Promise.all([storedDetail(db, game, vi.fn()), storedDetail(db, game, vi.fn())])
    expect(a).toEqual(b)
    expect(replayPooled).toHaveBeenCalledTimes(1)
  })

  it('rebuilds a detail stored by another version', async () => {
    await load()
    await db.updateTable('game_details').set({ version: 'old' }).execute()
    await load()
    expect(replayPooled).toHaveBeenCalledTimes(2)
    expect((await stored())?.version).not.toBe('old')
  })

  it('keeps the invalidated mark live, outside the stored detail', async () => {
    await load()
    await invalidateGame(db, 'g1', 'ann', null)
    expect((await getViewableGame(db, 'g1', 'ann'))?.invalidated).toBe(true)
    expect(JSON.stringify(await stored())).not.toContain('invalidated')
    await load()
    expect(replayPooled).toHaveBeenCalledTimes(1)
  })

  it('goes with the game when it is deleted', async () => {
    await load()
    await deleteGame(db, 'g1', 'ann')
    expect(await stored()).toBeUndefined()
  })
})
