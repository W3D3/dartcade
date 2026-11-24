import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertUsers } from '../test/fixtures.js'
import { createMission } from '../db/missions.js'
import { MISSION_REWARDS_PER_DAY, MISSION_XP } from '../shared/progression.js'
import { MissionSchema, type Mission, type MissionVisibility } from '../shared/missions/types.js'
import { MissionService } from './service.js'

const mission = (o: Partial<Mission> = {}): Mission =>
  MissionSchema.parse({
    name: 'Twenties',
    description: '',
    difficulty: 'medium',
    order: 'any',
    onFail: 'retry',
    pause: true,
    rankBy: 'time',
    steps: [{ type: 'hit', targets: ['S20'], hits: 3, inARow: false, order: 'any' }],
    ...o,
  })

describe.skipIf(!process.env.TEST_DATABASE_URL)('mission game end: bests and XP', { timeout: 30_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let service: MissionService
  let games = 0

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('missions_service_test'))
    await insertUsers(db, [
      { id: 'author', name: 'Ann' },
      { id: 'player', name: 'Pat' },
    ])
    service = new MissionService({ db, warn: () => undefined })
  })
  afterAll(() => close())
  afterEach(async () => {
    await db.deleteFrom('missions').execute()
    await db.deleteFrom('xp_ledger').execute()
    await db.deleteFrom('user_progress').execute()
    await db.deleteFrom('game_sessions').execute()
  })

  /** A finished mission game of `userId`'s, as the engine stores one, ended through the service. */
  async function finish(
    missionId: string,
    userId: string,
    o: { completed?: boolean; test?: boolean; timeMs?: number; darts?: number } = {},
  ) {
    const id = `g${++games}`
    await db
      .insertInto('game_sessions')
      .values({
        id,
        owner_user_id: userId,
        board_db_id: null,
        game_id: 'mission',
        config: JSON.stringify({ missionId, test: o.test ?? false, mission: mission(), highscores: [] }),
        status: 'finished',
        finished_at: new Date(),
      })
      .execute()
    const stats = { completed: (o.completed ?? true) ? 1 : 0, stepsDone: 1, steps: 1, timeMs: o.timeMs ?? 60_000, darts: o.darts ?? 10 }
    await db
      .insertInto('game_players')
      .values({
        session_id: id,
        seat: 0,
        name: 'P',
        user_id: userId,
        placement: 1,
        stats: JSON.stringify(stats),
        throw_position: 0,
        controller_user_id: userId,
        board_db_id: null,
        bot_level: null,
      })
      .execute()
    await service.onGameEnded({ sessionId: id, status: 'finished', gameId: 'mission' })
    return id
  }

  const paid = (userId: string) =>
    db.selectFrom('xp_ledger').select(['kind', 'source_id', 'amount']).where('user_id', '=', userId).execute()
  const best = (missionId: string, userId: string) =>
    db
      .selectFrom('mission_bests')
      .select(['time_ms', 'darts'])
      .where('mission_id', '=', missionId)
      .where('user_id', '=', userId)
      .executeTakeFirst()
  const make = (visibility: MissionVisibility = 'public', author = 'author') => createMission(db, author, mission(), visibility)

  it('pays the first completion only, and keeps the best run', async () => {
    const id = await make()
    await finish(id, 'player', { timeMs: 90_000 })
    await finish(id, 'player', { timeMs: 70_000 })
    await finish(id, 'player', { timeMs: 80_000 })
    expect(await paid('player')).toEqual([{ kind: 'mission', source_id: id, amount: MISSION_XP.medium }])
    expect(await best(id, 'player')).toEqual({ time_ms: 70_000, darts: 10 })
    const progress = await db.selectFrom('user_progress').select('xp_total').where('user_id', '=', 'player').executeTakeFirst()
    expect(progress?.xp_total).toBe(MISSION_XP.medium)
  })

  it('pays nothing for your own mission, but keeps your best', async () => {
    const id = await make('public', 'player')
    await finish(id, 'player')
    expect(await paid('player')).toEqual([])
    expect(await best(id, 'player')).toBeDefined()
  })

  it('a test run or a failed run leaves no best and pays nothing', async () => {
    const id = await make()
    await finish(id, 'player', { test: true })
    await finish(id, 'player', { completed: false })
    expect(await paid('player')).toEqual([])
    expect(await best(id, 'player')).toBeUndefined()
  })

  it('pays at most the daily cap of missions; the rest still keep their best', async () => {
    const ids = []
    for (let i = 0; i <= MISSION_REWARDS_PER_DAY; i++) ids.push(await make())
    for (const id of ids) await finish(id, 'player')
    expect((await paid('player')).length).toBe(MISSION_REWARDS_PER_DAY)
    expect(await best(ids[MISSION_REWARDS_PER_DAY], 'player')).toBeDefined()
  })

  it('a game of no mission game, or aborted, is not its business', async () => {
    const id = await make()
    await service.onGameEnded({ sessionId: 'nope', status: 'finished', gameId: 'x01' })
    await service.onGameEnded({ sessionId: 'nope', status: 'aborted', gameId: 'mission' })
    expect(await best(id, 'player')).toBeUndefined()
  })
})
