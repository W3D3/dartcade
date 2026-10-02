import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { abortGameSession, getActiveGameSessions, insertGameSession } from './queries.js'
import { pgErrorCode } from './errors.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('lobby tables', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ({ db, close } = await openTestSchema('lobbies_db_test'))
    await db.insertInto('user').values([
      { id: 'chris', name: 'Christoph', email: 'c@example.com', emailVerified: false, image: null },
      { id: 'lena', name: 'Lena', email: 'l@example.com', emailVerified: false, image: null },
      { id: 'max', name: 'Max', email: 'm@example.com', emailVerified: false, image: null },
      { id: 'sam', name: 'Sam', email: 's@example.com', emailVerified: false, image: null },
    ]).execute()
  })
  afterAll(async () => { await close() })

  describe('games from a lobby', () => {
    it('links a game to its lobby and reads the lobby name back', async () => {
      await db.insertInto('lobbies').values({ id: 'l1', name: "Christoph's lobby", host_user_id: 'chris', code: 'K7Q4MA' }).execute()
      await insertGameSession(db, {
        id: 'g1', owner_user_id: 'chris', board_db_id: null, game_id: 'x01', game_version: 1, rng_seed: 1, config: {}, lobby_id: 'l1',
        players: [{ name: 'Christoph', user_id: 'chris', controller_user_id: 'chris', board_db_id: null }],
      })
      const game = (await getActiveGameSessions(db)).find(s => s.id === 'g1')
      expect(game).toMatchObject({ lobby_id: 'l1', lobby_name: "Christoph's lobby" })
    })

    it('reads a local game with no lobby', async () => {
      await insertGameSession(db, {
        id: 'g-local', owner_user_id: 'chris', board_db_id: null, game_id: 'atc', game_version: 1, rng_seed: 1, config: {},
        players: [{ name: 'Christoph', user_id: 'chris', controller_user_id: 'chris', board_db_id: null }],
      })
      const game = (await getActiveGameSessions(db)).find(s => s.id === 'g-local')
      expect(game).toMatchObject({ lobby_id: null, lobby_name: null })
    })

    it('records who aborted a game', async () => {
      await abortGameSession(db, 'g1', new Date(), 'chris')
      await abortGameSession(db, 'g-local', new Date())
      const rows = await db.selectFrom('game_sessions').select(['id', 'status', 'aborted_by_user_id']).orderBy('id').execute()
      expect(rows).toEqual([
        { id: 'g-local', status: 'aborted', aborted_by_user_id: null },
        { id: 'g1', status: 'aborted', aborted_by_user_id: 'chris' },
      ])
    })
  })

  describe('constraints', () => {
    afterAll(async () => { await db.deleteFrom('lobby_people').execute() })

    it('keeps a user in one open lobby', async () => {
      await db.insertInto('lobbies').values([
        { id: 'c1', name: 'A', host_user_id: 'sam', code: 'AAAAAA' },
        { id: 'c2', name: 'B', host_user_id: 'sam', code: 'BBBBBB' },
      ]).execute()
      const row = (id: string, lobbyId: string) => ({
        id, lobby_id: lobbyId, user_id: 'sam', added_by_user_id: 'sam', name: 'Sam', board_id: null, position: 0, board_moved_by: null,
      })
      await db.insertInto('lobby_people').values(row('p1', 'c1')).execute()
      const err = await db.insertInto('lobby_people').values(row('p2', 'c2')).execute().catch((e: unknown) => e)
      expect(pgErrorCode(err)).toBe('23505')
    })

    it('lets a closed lobby\'s code be used again, but not an open one\'s', async () => {
      await db.updateTable('lobbies').set({ closed_at: new Date() }).where('id', '=', 'c1').execute()
      await db.insertInto('lobbies').values({ id: 'c3', name: 'C', host_user_id: 'sam', code: 'AAAAAA' }).execute()
      const err = await db.insertInto('lobbies').values({ id: 'c4', name: 'D', host_user_id: 'sam', code: 'BBBBBB' }).execute().catch((e: unknown) => e)
      expect(pgErrorCode(err)).toBe('23505')
    })
  })
})
