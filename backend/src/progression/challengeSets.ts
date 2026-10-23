// Challenge sets in the database: written the first time a period is read or a game ends in it (no
// cron job), moved on by finished games, rerolled once a day, paid when claimed. A finished
// challenge left unclaimed is paid once its period has ended, the next time the sets are read, so
// no XP is lost. The rules are in challenges.ts.
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/challenges.js'
import { gameList } from '../games/index.js'
import { loadFlagUser, modeAvailable } from '../flags/index.js'
import { addXp, insertAwards, lockUser, unlock } from '../db/progression.js'
import { addDays, levelOf, startOfLocalDay } from '../shared/progression.js'
import type { components } from '../schema/api.js'
import { reachedPerks, type Award } from './rules.js'
import {
  type ChallengeContext,
  type ChallengeGame,
  type Period,
  applyGame,
  challengeTitle,
  generateChallenge,
  generateSet,
  metricOf,
  periodEnd,
  periodKey,
  templateById,
} from './challenges.js'

type Challenges = components['schemas']['Challenges']
const PERIODS: readonly Period[] = ['daily', 'weekly']

async function context(db: Kysely<Database>, userId: string, today: string): Promise<ChallengeContext> {
  const [rates, played, flagUser] = await Promise.all([
    q.recentRates(db, userId, today),
    q.modesPlayedSince(db, userId, startOfLocalDay(addDays(today, -14), 'UTC')),
    loadFlagUser(db, userId),
  ])
  const untried: string[] = []
  for (const m of gameList) if (!played.includes(m.id) && (await modeAvailable(m.id, flagUser))) untried.push(m.id)
  return { ...rates, untriedModes: untried }
}

/** Runs `fn` holding the account's lock; a transaction passed in is the caller's, which holds it already. */
function locked<T>(db: Kysely<Database>, userId: string, fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  if (db.isTransaction) return fn(db)
  return db.transaction().execute(async trx => {
    await lockUser(trx, userId)
    return fn(trx)
  })
}

/** Pays the finished challenges not paid yet, once each (on the ledger's `day`); returns the XP paid. */
async function pay(trx: Kysely<Database>, userId: string, candidates: q.ChallengeRow[], day: string, at: Date): Promise<number> {
  const ids = await q.markClaimed(
    trx,
    userId,
    candidates.map(c => c.id),
    at,
  )
  const awards: Award[] = candidates
    .filter(c => ids.includes(c.id))
    .map(c => ({
      kind: 'challenge',
      sourceType: 'challenge',
      sourceId: c.id,
      amount: c.xp,
      meta: { title: challengeTitle(c), period: c.period },
    }))
  const written = await insertAwards(trx, userId, '', day, awards, at)
  const total = written.reduce((a, r) => a + r.amount, 0)
  if (total === 0) return 0
  const { after } = await addXp(trx, userId, total)
  await unlock(trx, userId, reachedPerks({ level: levelOf(after).level, streak: 0, ranked: { wins: 0, bestRank: null } }), at)
  return total
}

/** The day's and the week's sets around `today`, written if they don't exist yet; ended periods' unclaimed challenges are paid. */
export async function ensureSets(db: Kysely<Database>, userId: string, today: string): Promise<Record<Period, q.ChallengeRow[]>> {
  const ended = await q.endedUnclaimed(db, userId, periodKey('daily', today), periodKey('weekly', today))
  if (ended.length > 0) await locked(db, userId, trx => pay(trx, userId, ended, today, new Date()))
  const out: Partial<Record<Period, q.ChallengeRow[]>> = {}
  let ctx: ChallengeContext | null = null
  for (const period of PERIODS) {
    const key = periodKey(period, today)
    let set = await q.getSet(db, userId, period, key)
    if (set.length === 0) {
      ctx ??= await context(db, userId, today)
      await q.insertSet(db, userId, period, key, generateSet(userId, period, key, ctx))
      set = await q.getSet(db, userId, period, key)
    }
    out[period] = set
  }
  return { daily: out.daily ?? [], weekly: out.weekly ?? [] }
}

export type Completed = { title: string; xp: number; period: Period }

/** Moves the challenges of the game's day and week on by the game; returns the ones it completed (claimed on Progress). */
export async function progressChallenges(
  db: Kysely<Database>,
  userId: string,
  day: string,
  g: ChallengeGame,
  at: Date,
): Promise<Completed[]> {
  const sets = await ensureSets(db, userId, day)
  const completed: Completed[] = []
  for (const period of PERIODS) {
    for (const c of sets[period]) {
      if (c.completedAt) continue
      const next = applyGame(c, g)
      if (!next) continue
      const done = next.progress >= c.target
      await q.saveProgress(db, c.id, { ...next, completedAt: done ? at : null })
      if (done) completed.push({ title: challengeTitle({ ...c, state: next.state }), xp: c.xp, period })
    }
  }
  return completed
}

/** Pays a finished challenge of yours; claiming it again pays nothing more. */
export async function claim(db: Kysely<Database>, userId: string, id: string, today: string): Promise<'not-found' | 'not-done' | 'ok'> {
  return locked(db, userId, async trx => {
    const c = await q.getChallenge(trx, userId, id)
    if (!c) return 'not-found'
    if (!c.completedAt) return 'not-done'
    await pay(trx, userId, [c], today, new Date())
    return 'ok'
  })
}

/** One reroll a day, on an unfinished challenge of today's set. */
export async function reroll(db: Kysely<Database>, userId: string, id: string, today: string): Promise<'not-found' | 'not-allowed' | 'ok'> {
  const c = await q.getChallenge(db, userId, id)
  if (!c) return 'not-found'
  if (c.period !== 'daily' || c.periodKey !== today || c.completedAt || (await q.rerollsOn(db, userId, today)) > 0) return 'not-allowed'
  const set = await q.getSet(db, userId, 'daily', today)
  const others = set.filter(x => x.id !== c.id).map(x => metricOf(x.templateId))
  const difficulty = templateById(c.templateId)?.difficulty
  const next = generateChallenge(
    userId,
    'daily',
    today,
    c.slot,
    c.reroll + 1,
    await context(db, userId, today),
    [...others, metricOf(c.templateId)],
    difficulty,
  )
  await q.replaceSlot(db, c.id, next, c.reroll + 1)
  return 'ok'
}

/** The sets as GET /api/challenges shows them. */
export async function challengesView(db: Kysely<Database>, userId: string, today: string, timeZone: string | null): Promise<Challenges> {
  const sets = await ensureSets(db, userId, today)
  const rerollLeft = (await q.rerollsOn(db, userId, today)) === 0
  const view = (period: Period) => ({
    resetsAt: startOfLocalDay(periodEnd(period, periodKey(period, today)), timeZone).toISOString(),
    items: sets[period].map(c => ({
      id: c.id,
      slot: c.slot,
      title: challengeTitle(c),
      difficulty: templateById(c.templateId)?.difficulty ?? 'easy',
      target: c.target,
      progress: Math.min(c.progress, c.target),
      xp: c.xp,
      completed: c.completedAt !== null,
      claimed: c.claimedAt !== null,
      canReroll: period === 'daily' && rerollLeft && c.completedAt === null,
    })),
  })
  return { daily: view('daily'), weekly: view('weekly') }
}
