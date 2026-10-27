import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import { insertGameSession } from './queries.js'
import { insertFriendRequest, acceptFriendRequest } from './friends.js'
import { deleteActivityForGame, insertActivity, listFriendActivity, pruneActivity, type ActivityInsert } from './activity.js'
import { openTestSchema } from './testSchema.js'
import type { Database } from './schema.js'

const DAY = 86_400_000

describe.skipIf(!process.env.TEST_DATABASE_URL)('friend activity queries', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const now = new Date()
  const ago = (days: number) => new Date(now.getTime() - days * DAY)

  async function game(id: string) {
    await insertGameSession(db, {
      id,
      owner_user_id: 'ann',
      board_db_id: null,
      game_id: 'x01',
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: [{ name: 'Ann', user_id: 'ann', controller_user_id: 'ann', board_db_id: null, bot_level: null }],
    })
  }
  const oneEighty = (gameId: string, userId: string, at: Date, count = 1): ActivityInsert => ({
    userId,
    gameId,
    at,
    kind: 'one_eighty',
    payload: { count },
  })
  const tonOut = (gameId: string, userId: string, at: Date): ActivityInsert => ({
    userId,
    gameId,
    at,
    kind: 'ton_out',
    payload: { count: 1, best: 129 },
  })
  const rankUp = (gameId: string, userId: string, at: Date): ActivityInsert => ({
    userId,
    gameId,
    at,
    kind: 'rank_up',
    payload: { mode: '1v1', rankIndex: 3 },
  })

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('home_activity_test'))
    await db
      .insertInto('user')
      .values(
        ['ann', 'bob', 'cy'].map(id => ({
          id,
          name: id,
          email: `${id}@example.com`,
          emailVerified: true,
          image: null,
          role: null,
        })),
      )
      .execute()
    // ann and bob are friends, cy is a stranger to both
    await insertFriendRequest(db, { id: 'f1', requesterId: 'ann', addresseeId: 'bob' })
    await acceptFriendRequest(db, 'f1', now)
    for (const g of ['g1', 'g2', 'g3', 'g4']) await game(g)
  })
  afterAll(async () => close())

  it('lists a friend’s events, newest first, and not a stranger’s or the viewer’s own', async () => {
    await insertActivity(db, [
      oneEighty('g1', 'bob', ago(2)),
      tonOut('g2', 'bob', ago(1)),
      oneEighty('g1', 'cy', ago(1)),
      rankUp('g3', 'ann', ago(1)),
    ])
    const rows = await listFriendActivity(db, 'ann')
    expect(rows.map(r => [r.userId, r.kind])).toEqual([
      ['bob', 'ton_out'],
      ['bob', 'one_eighty'],
    ])
    expect(rows[0]).toMatchObject({ name: 'bob', payload: { count: 1, best: 129 } })
    expect(rows[0].avatar).toBeDefined()
  })

  it('gives someone without friends an empty list', async () => {
    expect(await listFriendActivity(db, 'cy')).toEqual([])
  })

  it('writes the same (game, user, kind) once', async () => {
    await insertActivity(db, [oneEighty('g4', 'bob', ago(0))])
    await insertActivity(db, [oneEighty('g4', 'bob', ago(0), 5)])
    const rows = await db.selectFrom('friend_activity').select('payload').where('game_id', '=', 'g4').execute()
    expect(rows).toEqual([{ payload: { count: 1 } }])
  })

  it('leaves out events older than a week and honours the limit', async () => {
    await insertActivity(db, [rankUp('g3', 'bob', ago(8))])
    const all = await listFriendActivity(db, 'ann')
    expect(all.some(r => r.kind === 'rank_up')).toBe(false)
    expect(await listFriendActivity(db, 'ann', { limit: 1 })).toHaveLength(1)
  })

  it('deletes the events of one game only', async () => {
    await deleteActivityForGame(db, 'g1')
    const left = await db.selectFrom('friend_activity').select(['game_id']).execute()
    expect(left.some(r => r.game_id === 'g1')).toBe(false)
    expect(left.some(r => r.game_id === 'g2')).toBe(true)
  })

  it('prunes rows older than the cutoff and reports how many', async () => {
    const removed = await pruneActivity(db, ago(5))
    expect(removed).toBe(1) // the 8-day-old rank_up on g3
    expect(await pruneActivity(db, ago(5))).toBe(0)
  })
})
