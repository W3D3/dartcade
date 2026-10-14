import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import { openTestSchema } from '../db/testSchema.js'
import { listFinishedGames } from '../db/history.js'
import type { Database } from '../db/schema.js'
import { seedSample } from './sample.js'

const NAMES = ['Admin', 'Luke', 'Phil', 'Michael', 'Gerwyn']

describe.skipIf(!process.env.TEST_DATABASE_URL)('preview sample data', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('seed_sample_test'))
  })
  afterAll(async () => {
    await close()
  })

  const counts = async () => ({
    games: (await db.selectFrom('game_sessions').select(['status']).execute()).map(r => r.status),
    friendships: (await db.selectFrom('friendships').select('status').orderBy('status').execute()).map(r => r.status),
    openLobbies: (await db.selectFrom('lobbies').select('id').where('closed_at', 'is', null).execute()).length,
    pendingInvites: (await db.selectFrom('lobby_invites').select('id').where('status', '=', 'pending').execute()).length,
  })

  it('needs the dev accounts', async () => {
    await expect(seedSample(db)).rejects.toThrow('admin@dartcade.local missing')
  })

  it('plays finished games for every dev account, befriends them and opens a lobby, once', async () => {
    await db
      .insertInto('user')
      .values(
        NAMES.map(name => ({
          id: name.toLowerCase(),
          name,
          email: `${name.toLowerCase()}@dartcade.local`,
          emailVerified: false,
          image: null,
        })),
      )
      .execute()

    await seedSample(db)
    const first = await counts()
    expect(first.games.length).toBeGreaterThan(0)
    expect(first.games.every(s => s === 'finished')).toBe(true)
    expect(first.friendships).toEqual(['accepted', 'accepted', 'accepted', 'accepted', 'pending', 'pending'])
    expect(first).toMatchObject({ openLobbies: 1, pendingInvites: 1 })
    for (const name of NAMES) {
      const { games } = await listFinishedGames(db, name.toLowerCase(), { limit: 50, after: null })
      expect(games.length, name).toBeGreaterThan(0)
    }

    await seedSample(db)
    expect(await counts()).toEqual(first)
  })
})
