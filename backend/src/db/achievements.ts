import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { achievement, tierOf } from '../shared/achievements.js'

export type AchievementRow = {
  id: string
  count: number
  tier: number
  earnedAt: Date | null
  tierAt: Date | null
  seenTier: number
  showcaseSlot: number | null
}

/** Marks the game counted for the account; false when it already was. */
export async function claimGame(db: Kysely<Database>, userId: string, gameId: string): Promise<boolean> {
  const rows = await db
    .insertInto('achievement_games')
    .values({ user_id: userId, game_id: gameId })
    .onConflict(oc => oc.doNothing())
    .returning('game_id')
    .execute()
  return rows.length > 0
}

/** Adds to the counts (ids outside the catalogue are skipped); returns each achievement's tier before and after. */
export async function addCounts(
  db: Kysely<Database>,
  userId: string,
  gameId: string,
  at: Date,
  adds: Map<string, number>,
): Promise<{ id: string; count: number; before: number; after: number }[]> {
  const out = []
  for (const [id, by] of adds) {
    const def = achievement(id)
    if (!def) continue
    const row = await db
      .selectFrom('user_achievements')
      .select(['count', 'tier'])
      .where('user_id', '=', userId)
      .where('achievement_id', '=', id)
      .forUpdate()
      .executeTakeFirst()
    const before = row?.tier ?? 0
    const count = (row?.count ?? 0) + by
    const after = tierOf(def, count)
    const up = after > before
    await db
      .insertInto('user_achievements')
      .values({
        user_id: userId,
        achievement_id: id,
        count,
        tier: after,
        earned_at: up && before === 0 ? at : null,
        tier_at: up ? at : null,
        game_id: up ? gameId : null,
        showcase_slot: null,
      })
      .onConflict(oc =>
        oc.columns(['user_id', 'achievement_id']).doUpdateSet({
          count,
          tier: after,
          ...(up && { tier_at: at, game_id: gameId }),
          ...(up && before === 0 && { earned_at: at }),
        }),
      )
      .execute()
    out.push({ id, count, before, after })
  }
  return out
}

export async function listAchievements(db: Kysely<Database>, userId: string): Promise<AchievementRow[]> {
  const rows = await db.selectFrom('user_achievements').selectAll().where('user_id', '=', userId).execute()
  return rows.map(r => ({
    id: r.achievement_id,
    count: r.count,
    tier: r.tier,
    earnedAt: r.earned_at,
    tierAt: r.tier_at,
    seenTier: r.seen_tier,
    showcaseSlot: r.showcase_slot,
  }))
}

/** Replaces the showcase with `ids` in order. The caller has checked they are earned. */
export async function setShowcase(db: Kysely<Database>, userId: string, ids: string[]): Promise<void> {
  await db.transaction().execute(async trx => {
    await trx.updateTable('user_achievements').set({ showcase_slot: null }).where('user_id', '=', userId).execute()
    for (const [slot, id] of ids.entries()) {
      await trx
        .updateTable('user_achievements')
        .set({ showcase_slot: slot })
        .where('user_id', '=', userId)
        .where('achievement_id', '=', id)
        .execute()
    }
  })
}

/** The player has looked at everything earned so far. */
export async function markSeen(db: Kysely<Database>, userId: string): Promise<void> {
  await db
    .updateTable('user_achievements')
    .set({ seen_tier: sql`tier` })
    .where('user_id', '=', userId)
    .execute()
}

export async function backfillDone(db: Kysely<Database>): Promise<boolean> {
  return (await db.selectFrom('achievement_backfill').select('done_at').executeTakeFirst()) !== undefined
}

export async function markBackfillDone(db: Kysely<Database>): Promise<void> {
  await db.insertInto('achievement_backfill').defaultValues().execute()
}
