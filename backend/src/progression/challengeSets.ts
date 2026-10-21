// Challenge sets in the database: written the first time a period is read or a game ends in it (no
// cron job), moved on by finished games, rerolled once a day. The rules are in challenges.ts.
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/challenges.js'
import { gameList } from '../games/index.js'
import { loadFlagUser, modeAvailable } from '../flags/index.js'
import { addDays, startOfLocalDay } from '../shared/progression.js'
import type { components } from '../schema/api.js'
import type { Award } from './rules.js'
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

/** The day's and the week's sets around `today`, written if they don't exist yet. */
export async function ensureSets(db: Kysely<Database>, userId: string, today: string): Promise<Record<Period, q.ChallengeRow[]>> {
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

/**
 * Moves the challenges of the game's day and week on by the game. Returns the awards for the ones
 * it completed (a ledger row each, keyed by the challenge) and what they were.
 */
export async function progressChallenges(
  db: Kysely<Database>,
  userId: string,
  day: string,
  g: ChallengeGame,
  at: Date,
): Promise<{ awards: Award[]; completed: Completed[] }> {
  const sets = await ensureSets(db, userId, day)
  const awards: Award[] = []
  const completed: Completed[] = []
  for (const period of PERIODS) {
    for (const c of sets[period]) {
      if (c.completedAt) continue
      const next = applyGame(c, g)
      if (!next) continue
      const done = next.progress >= c.target
      await q.saveProgress(db, c.id, { ...next, completedAt: done ? at : null })
      if (!done) continue
      const title = challengeTitle({ ...c, state: next.state })
      awards.push({ kind: 'challenge', sourceType: 'challenge', sourceId: c.id, amount: c.xp, meta: { title, period, sessionId: g.id } })
      completed.push({ title, xp: c.xp, period })
    }
  }
  return { awards, completed }
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
      canReroll: period === 'daily' && rerollLeft && c.completedAt === null,
    })),
  })
  return { daily: view('daily'), weekly: view('weekly') }
}
