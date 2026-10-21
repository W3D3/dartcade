import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { ProgressionService } from './service.js'
import { getProgress, revokeGameXp } from '../db/progression.js'
import type { XpGainedMessage } from '../schema/lobby-ws.js'

const T20 = { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }
const S1 = { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 }

describe.skipIf(!process.env.TEST_DATABASE_URL)('ProgressionService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let pushed: { userId: string; msg: XpGainedMessage }[]
  let service: ProgressionService
  let n = 0

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('progression_service'))
    await db
      .insertInto('user')
      .values(['ann', 'bob'].map(id => ({ id, name: id, email: `${id}@example.com`, emailVerified: true, image: null })))
      .execute()
  })
  afterAll(async () => {
    await close()
  })
  beforeEach(async () => {
    pushed = []
    service = new ProgressionService({ db, push: (userId, msg) => void pushed.push({ userId, msg }), warn: () => undefined })
    await sql`TRUNCATE xp_ledger, user_progress, progression_backfill, game_sessions CASCADE`.execute(db)
  })

  /** A finished 1v1: ann wins against bob, each throws `visits` visits on the board (`first` as ann's first visit). */
  async function duel(opts: { visits?: number; source?: string; first?: object[]; at?: Date } = {}): Promise<string> {
    const id = `g${++n}`
    const at = opts.at ?? new Date('2026-10-21T12:00:00Z')
    await db
      .insertInto('game_sessions')
      .values({ id, owner_user_id: 'ann', board_db_id: null, game_id: 'x01', config: '{}', status: 'finished', finished_at: at })
      .execute()
    await db
      .insertInto('game_players')
      .values(
        ['ann', 'bob'].map((u, seat) => ({
          session_id: id,
          seat,
          name: u,
          user_id: u,
          controller_user_id: u,
          placement: seat + 1,
          stats: '{}',
          throw_position: seat,
        })),
      )
      .execute()
    const darts = []
    for (let v = 0; v < (opts.visits ?? 4) * 2; v++) {
      for (let i = 0; i < 3; i++) {
        const seg = v === 0 && opts.first ? opts.first[i] : S1
        darts.push({
          session_id: id,
          visit: v,
          dart_index: i,
          seat: v % 2,
          leg: 0,
          phase: 'game',
          segment: JSON.stringify(seg),
          coords: null,
          source: opts.source ?? 'camera',
          corrected: false,
          thrown_at: at,
        })
      }
    }
    await db.insertInto('game_darts').values(darts).execute()
    return id
  }

  it('pays each player once, however often the game is settled', async () => {
    const id = await duel({ first: [T20, T20, T20] })
    await service.awardGame(id)
    await service.awardGame(id)
    // ann: 12 darts + game 50 + win 100 + one 180 + the day's first-game bonus; bob: 12 darts + game 50 + bonus
    expect((await getProgress(db, 'ann')).xp).toBe(12 + 50 + 100 + 25 + 100)
    expect((await getProgress(db, 'bob')).xp).toBe(162)
    expect(pushed.map(p => p.userId)).toEqual(['ann', 'bob'])
    expect(pushed[0].msg).toMatchObject({
      sessionId: id,
      total: 287,
      xpBefore: 0,
      xpAfter: 287,
      streak: { current: 1, freezes: 1, frozeDay: null, milestone: null },
      levelBefore: 1,
      levelAfter: 2,
      lines: expect.arrayContaining([
        { kind: 'dart', amount: 12, count: 12 },
        { kind: 'oneEighty', amount: 25, count: 1 },
        { kind: 'daily', amount: 100, count: 1 },
      ]),
    })
  })

  it('pays a manual game half game XP and no dart XP', async () => {
    await service.awardGame(await duel({ source: 'manual' }))
    expect((await getProgress(db, 'bob')).xp).toBe(125)
  })

  it('counts the day in the account’s time zone', async () => {
    await db
      .updateTable('user')
      .set({ preferences: sql`'{"timeZone":"Pacific/Kiritimati"}'::jsonb` })
      .where('id', '=', 'bob')
      .execute()
    await service.awardGame(await duel({ at: new Date('2026-10-21T20:00:00Z') }))
    const row = await db
      .selectFrom('xp_ledger')
      .select(sql<string>`local_date::text`.as('d'))
      .where('user_id', '=', 'bob')
      .executeTakeFirstOrThrow()
    expect(row.d).toBe('2026-10-22')
    await db
      .updateTable('user')
      .set({ preferences: sql`'{}'::jsonb` })
      .where('id', '=', 'bob')
      .execute()
  })

  it('backfills old games once, without pushing', async () => {
    await duel({ first: [T20, T20, T20] })
    expect(await service.backfill()).toBe(1)
    expect(await service.backfill()).toBe(0)
    // No highlight in a backfill
    expect((await getProgress(db, 'ann')).xp).toBe(162)
    expect(pushed).toEqual([])
  })

  it('takes a game’s XP back', async () => {
    const keep = await duel()
    const drop = await duel()
    await service.awardGame(keep)
    await service.awardGame(drop)
    expect((await getProgress(db, 'bob')).xp).toBe(224)
    await db.transaction().execute(trx => revokeGameXp(trx, drop))
    expect((await getProgress(db, 'bob')).xp).toBe(162)
  })

  it('pays the bonus for the first game of a day and keeps the streak with a freeze', async () => {
    const day = (d: number) => new Date(`2026-10-0${d}T12:00:00Z`)
    await service.awardGame(await duel({ at: day(1) }))
    await service.awardGame(await duel({ at: day(1) }))
    await service.awardGame(await duel({ at: day(2) }))
    // Day 3 missed: the freeze covers it
    await service.awardGame(await duel({ at: day(4) }))
    const bonuses = await db
      .selectFrom('xp_ledger')
      .select(['kind', 'amount', 'source_id'])
      .where('user_id', '=', 'bob')
      .where('kind', 'in', ['daily', 'freeze'])
      .orderBy('id')
      .execute()
    expect(bonuses).toEqual([
      { kind: 'daily', amount: 100, source_id: '2026-10-01' },
      { kind: 'daily', amount: 110, source_id: '2026-10-02' },
      { kind: 'daily', amount: 120, source_id: '2026-10-04' },
      { kind: 'freeze', amount: 0, source_id: '2026-10-03' },
    ])
    expect(pushed.at(-1)?.msg.streak).toEqual({ current: 3, freezes: 0, frozeDay: '2026-10-03', milestone: null })
  })
})
