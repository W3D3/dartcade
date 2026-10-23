import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { ProgressionService } from './service.js'
import { getProgress, revokeGameXp } from '../db/progression.js'
import { insertSet, getSet } from '../db/challenges.js'
import { claim, ensureSets, reroll } from './challengeSets.js'
import type { XpGainedMessage } from '../schema/lobby-ws.js'

const T20 = { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }
const S1 = { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 }

describe.skipIf(!process.env.TEST_DATABASE_URL)('ProgressionService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let pushed: { userId: string; msg: XpGainedMessage }[]
  let service: ProgressionService
  let off: Set<string>
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
    off = new Set()
    service = new ProgressionService({
      db,
      enabled: userId => Promise.resolve(!off.has(userId)),
      push: (userId, msg) => void pushed.push({ userId, msg }),
      warn: () => undefined,
    })
    await sql`TRUNCATE xp_ledger, user_progress, progression_backfill, game_sessions, user_challenges CASCADE`.execute(db)
  })

  /** XP paid other than for challenges (which depend on the generated sets); the totals match the ledger. */
  async function earned(userId: string): Promise<number> {
    const rows = await db.selectFrom('xp_ledger').select(['kind', 'amount']).where('user_id', '=', userId).execute()
    const total = rows.reduce((a, r) => a + r.amount, 0)
    expect((await getProgress(db, userId)).xp).toBe(total)
    return rows.filter(r => r.kind !== 'challenge').reduce((a, r) => a + r.amount, 0)
  }

  /** The challenge XP the account was paid, row by row. */
  async function challengeXp(userId: string): Promise<number[]> {
    const rows = await db.selectFrom('xp_ledger').select('amount').where('user_id', '=', userId).where('kind', '=', 'challenge').execute()
    return rows.map(r => r.amount)
  }

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
    expect(await earned('ann')).toBe(12 + 50 + 100 + 25 + 100)
    expect(await earned('bob')).toBe(162)
    expect(pushed.map(p => p.userId)).toEqual(['ann', 'bob'])
    expect(pushed[0].msg).toMatchObject({
      sessionId: id,
      xpBefore: 0,
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

  it('pays nothing to an account progression is off for', async () => {
    off.add('bob')
    await service.awardGame(await duel())
    expect(await db.selectFrom('xp_ledger').select('id').where('user_id', '=', 'bob').execute()).toEqual([])
    expect((await getProgress(db, 'bob')).xp).toBe(0)
    expect(await db.selectFrom('user_challenges').select('id').where('user_id', '=', 'bob').execute()).toEqual([])
    expect(pushed.map(p => p.userId)).toEqual(['ann'])
  })

  it('pays a manual game half game XP and no dart XP', async () => {
    await service.awardGame(await duel({ source: 'manual' }))
    expect(await earned('bob')).toBe(125)
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
    expect(await earned('ann')).toBe(162)
    expect(pushed).toEqual([])
  })

  it('takes a game’s XP back', async () => {
    const keep = await duel()
    const drop = await duel()
    await service.awardGame(keep)
    await service.awardGame(drop)
    expect(await earned('bob')).toBe(224)
    await db.transaction().execute(trx => revokeGameXp(trx, drop))
    expect(await earned('bob')).toBe(162)
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

  it('writes the day and week sets and moves them on, paying a finished challenge only when claimed', async () => {
    const d = (slot: number, templateId: string, target: number) => ({
      slot,
      templateId,
      difficulty: 'easy' as const,
      target,
      xp: 40,
      state: {},
    })
    await insertSet(db, 'bob', 'daily', '2026-10-21', [d(1, 'd.games', 1), d(2, 'd.darts', 100), d(3, 'd.win', 1)])
    const id = await duel()
    await service.awardGame(id)
    await service.awardGame(id)
    const daily = await getSet(db, 'bob', 'daily', '2026-10-21')
    expect(daily.map(c => [c.templateId, c.progress, c.completedAt !== null])).toEqual([
      ['d.games', 1, true],
      ['d.darts', 12, false],
      ['d.win', 0, false],
    ])
    // The week's set was written on the way
    expect(await getSet(db, 'bob', 'weekly', '2026-10-19')).toHaveLength(3)
    expect(await challengeXp('bob')).toEqual([])
    expect(pushed.find(p => p.userId === 'bob')?.msg.challenges).toEqual([{ title: 'Finish 1 game', xp: 40, period: 'daily' }])
    const xp = (await getProgress(db, 'bob')).xp
    expect(await claim(db, 'bob', daily[1].id, '2026-10-21')).toBe('not-done')
    expect(await claim(db, 'ann', daily[0].id, '2026-10-21')).toBe('not-found')
    expect(await claim(db, 'bob', daily[0].id, '2026-10-21')).toBe('ok')
    expect(await claim(db, 'bob', daily[0].id, '2026-10-21')).toBe('ok')
    expect(await challengeXp('bob')).toEqual([40])
    expect((await getProgress(db, 'bob')).xp).toBe(xp + 40)
    expect((await getSet(db, 'bob', 'daily', '2026-10-21'))[0].claimedAt).not.toBeNull()
  })

  it('pays an unclaimed challenge by itself once its period has ended', async () => {
    const d = (slot: number) => ({ slot, templateId: 'd.games', difficulty: 'easy' as const, target: 1, xp: 40, state: {} })
    await insertSet(db, 'bob', 'daily', '2026-10-21', [d(1), d(2), d(3)])
    await service.awardGame(await duel())
    expect(await challengeXp('bob')).toEqual([])
    // Still today: nothing yet
    await ensureSets(db, 'bob', '2026-10-21')
    expect(await challengeXp('bob')).toEqual([])
    const xp = (await getProgress(db, 'bob')).xp
    await Promise.all([ensureSets(db, 'bob', '2026-10-22'), ensureSets(db, 'bob', '2026-10-22')])
    expect(await challengeXp('bob')).toEqual([40, 40, 40])
    expect((await getProgress(db, 'bob')).xp).toBe(xp + 120)
  })

  it('rerolls an unfinished daily of today once a day', async () => {
    const d = (slot: number, templateId: string) => ({ slot, templateId, difficulty: 'easy' as const, target: 5, xp: 40, state: {} })
    await insertSet(db, 'bob', 'daily', '2026-10-21', [d(1, 'd.games'), d(2, 'd.trebles'), d(3, 'd.d16')])
    const [first, second] = await getSet(db, 'bob', 'daily', '2026-10-21')
    expect(await reroll(db, 'bob', first.id, '2026-10-22')).toBe('not-allowed')
    expect(await reroll(db, 'bob', first.id, '2026-10-21')).toBe('ok')
    const after = await getSet(db, 'bob', 'daily', '2026-10-21')
    expect(after[0].reroll).toBe(1)
    expect(after[0].templateId).not.toBe('d.games')
    expect(['d.trebles', 'd.d16']).not.toContain(after[0].templateId)
    expect(await reroll(db, 'bob', second.id, '2026-10-21')).toBe('not-allowed')
  })
})
