import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import { openTestSchema } from '../db/testSchema.js'
import { getFinishedGame, listFinishedGames } from '../db/history.js'
import { closePool } from '../games/minigolfPool.js'
import { gameList } from '../games/index.js'
import { storedDetail } from '../history/detail.js'
import type { Database } from '../db/schema.js'
import { seedSample } from './sample.js'
import { COACH_GAMES } from './coachGames.js'
import { insertUsers } from '../test/fixtures.js'

const NAMES = ['Admin', 'Luke', 'Phil', 'Michael', 'Gerwyn']

describe.skipIf(!process.env.TEST_DATABASE_URL)('preview sample data', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('seed_sample_test'))
  })
  afterAll(async () => {
    await closePool()
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
    await insertUsers(
      db,
      NAMES.map(name => ({ id: name.toLowerCase(), name, email: `${name.toLowerCase()}@dartcade.local` })),
    )

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
    const played = await db.selectFrom('game_sessions').select(['id', 'game_id']).execute()
    expect(new Set(played.map(g => g.game_id))).toEqual(new Set(gameList.map(m => m.id)))
    // Each one's details page replays it
    for (const { id, game_id } of played) {
      const game = await getFinishedGame(db, id)
      const warn = (msg: string, details: unknown) => {
        throw new Error(`${game_id} ${id}: ${msg} ${JSON.stringify(details)}`)
      }
      expect(game && (await storedDetail(db, game, warn)), game_id).toBeTruthy()
    }
    // The scripted games, the last ones played, throw exactly their script
    const scripted = await db.selectFrom('game_sessions').select('id').orderBy('created_at').execute()
    for (const [i, { id }] of scripted.slice(-COACH_GAMES.length).entries()) {
      const { script } = COACH_GAMES[i]
      const game = await getFinishedGame(db, id)
      const built = game && (await storedDetail(db, game, () => undefined))
      const detail = built?.detail
      if (detail?.mode !== 'x01') throw new Error(`game ${id} is no X01 game`)
      const rounds = Math.max(...script.map(s => s.length))
      const thrown = Array.from({ length: rounds }, (_, r) => script.flatMap(s => (s[r] ? [s[r]] : []))).flat()
      expect(detail.legs[0].visits.map(v => v.darts.map(d => d.segment.name))).toEqual(thrown)
    }

    await seedSample(db)
    expect(await counts()).toEqual(first)
  }, 60_000)
})
