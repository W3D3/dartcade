import { sql, type Kysely } from 'kysely'
import { ulid } from 'ulid'
import { z } from 'zod'
import type { Database } from './schema.js'
import type { Challenge, ChallengeState, Period } from '../progression/challenges.js'
import { addDays } from '../shared/progression.js'

export type ChallengeRow = {
  id: string
  period: Period
  periodKey: string
  slot: number
  templateId: string
  target: number
  progress: number
  xp: number
  completedAt: Date | null
  reroll: number
  state: ChallengeState
}

function columns(db: Kysely<Database>) {
  return db
    .selectFrom('user_challenges')
    .select([
      'id',
      'period',
      sql<string>`period_key::text`.as('period_key'),
      'slot',
      'template_id',
      'target',
      'progress',
      'xp',
      'completed_at',
      'reroll',
      'state',
    ])
}

const toRow = (r: {
  id: string
  period: Period
  period_key: string
  slot: number
  template_id: string
  target: number
  progress: number
  xp: number
  completed_at: Date | null
  reroll: number
  state: Record<string, unknown>
}): ChallengeRow => ({
  id: r.id,
  period: r.period,
  periodKey: r.period_key,
  slot: r.slot,
  templateId: r.template_id,
  target: r.target,
  progress: r.progress,
  xp: r.xp,
  completedAt: r.completed_at,
  reroll: r.reroll,
  state: StateSchema.parse(r.state),
})

// JSONB written by this backend; read defensively
const StateSchema = z
  .object({
    games: z.array(z.string()).optional(),
    set: z.array(z.union([z.string(), z.number()])).optional(),
    run: z.number().optional(),
    threshold: z.number().optional(),
  })
  .catch({})

/** A period's set, by slot. */
export async function getSet(db: Kysely<Database>, userId: string, period: Period, key: string): Promise<ChallengeRow[]> {
  const rows = await columns(db)
    .where('user_id', '=', userId)
    .where('period', '=', period)
    .where('period_key', '=', key)
    .orderBy('slot')
    .execute()
  return rows.map(toRow)
}

export async function getChallenge(db: Kysely<Database>, userId: string, id: string): Promise<ChallengeRow | undefined> {
  const row = await columns(db).where('user_id', '=', userId).where('id', '=', id).executeTakeFirst()
  return row ? toRow(row) : undefined
}

/** Writes a period's set, unless it is there already (then nothing changes). */
export async function insertSet(db: Kysely<Database>, userId: string, period: Period, key: string, set: Challenge[]): Promise<void> {
  await db
    .insertInto('user_challenges')
    .values(
      set.map(c => ({
        id: ulid(),
        user_id: userId,
        period,
        period_key: key,
        slot: c.slot,
        template_id: c.templateId,
        target: c.target,
        xp: c.xp,
        state: JSON.stringify(c.state),
      })),
    )
    .onConflict(oc => oc.columns(['user_id', 'period', 'period_key', 'slot']).doNothing())
    .execute()
}

export async function saveProgress(
  db: Kysely<Database>,
  id: string,
  next: { progress: number; state: ChallengeState; completedAt: Date | null },
): Promise<void> {
  await db
    .updateTable('user_challenges')
    .set({ progress: next.progress, state: JSON.stringify(next.state), completed_at: next.completedAt })
    .where('id', '=', id)
    .execute()
}

/** A rerolled slot: a new challenge in it, from zero. */
export async function replaceSlot(db: Kysely<Database>, id: string, c: Challenge, reroll: number): Promise<void> {
  await db
    .updateTable('user_challenges')
    .set({ template_id: c.templateId, target: c.target, xp: c.xp, state: JSON.stringify(c.state), progress: 0, reroll })
    .where('id', '=', id)
    .where('completed_at', 'is', null)
    .execute()
}

/** Your last 30 days before `today`: board darts and qualifying games per day you played, and your best X01 average. */
export async function recentRates(
  db: Kysely<Database>,
  userId: string,
  today: string,
): Promise<{ dartsPerDay: number | null; gamesPerDay: number | null; bestAverage: number | null }> {
  const from = addDays(today, -30)
  const row = await db
    .selectFrom('xp_ledger')
    .select([
      sql<number>`count(DISTINCT local_date) FILTER (WHERE kind = 'game')::int`.as('days'),
      sql<number>`count(*) FILTER (WHERE kind = 'game')::int`.as('games'),
      sql<number>`coalesce(sum(amount) FILTER (WHERE kind = 'dart'), 0)::int`.as('darts'),
    ])
    .where('user_id', '=', userId)
    .where('local_date', '>=', from)
    .where('local_date', '<', today)
    .executeTakeFirstOrThrow()
  const best = await db
    .selectFrom('game_players as gp')
    .innerJoin('game_sessions as gs', 'gs.id', 'gp.session_id')
    .select(sql<number | null>`max((gp.stats->>'average')::float8)`.as('best'))
    .where('gp.user_id', '=', userId)
    .where('gs.game_id', '=', 'x01')
    .where('gs.status', '=', 'finished')
    .where('gs.invalidated_at', 'is', null)
    .where('gs.finished_at', '>=', new Date(Date.parse(`${from}T00:00:00Z`)))
    .where(sql<boolean>`(gp.stats->>'dartsThrown')::int >= 9`)
    .executeTakeFirst()
  return {
    dartsPerDay: row.days > 0 ? row.darts / row.days : null,
    gamesPerDay: row.days > 0 ? row.games / row.days : null,
    bestAverage: best?.best ?? null,
  }
}

/** The modes you finished a game of since `since`. */
export async function modesPlayedSince(db: Kysely<Database>, userId: string, since: Date): Promise<string[]> {
  const rows = await db
    .selectFrom('game_players as gp')
    .innerJoin('game_sessions as gs', 'gs.id', 'gp.session_id')
    .select('gs.game_id')
    .distinct()
    .where('gp.user_id', '=', userId)
    .where('gs.status', '=', 'finished')
    .where('gs.finished_at', '>=', since)
    .execute()
  return rows.map(r => r.game_id)
}

/** Rerolls used on dailies of `day`. */
export async function rerollsOn(db: Kysely<Database>, userId: string, day: string): Promise<number> {
  const row = await db
    .selectFrom('user_challenges')
    .select(sql<number>`coalesce(sum(reroll), 0)::int`.as('n'))
    .where('user_id', '=', userId)
    .where('period', '=', 'daily')
    .where('period_key', '=', day)
    .executeTakeFirstOrThrow()
  return row.n
}
