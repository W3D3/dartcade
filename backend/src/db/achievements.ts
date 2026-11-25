import { sql, type Kysely } from 'kysely'
import { gameCounts } from './counts.js'
import type { Database } from './schema.js'
import type { AchievementSource } from '../achievements/rules.js'
import { ACHIEVEMENTS, achievement, crossings, modesOf, tierOf } from '../shared/achievements.js'

export type AchievementRow = {
  id: string
  count: number
  tier: number
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

/**
 * Adds to the counts (ids outside the catalogue are skipped), one source per count added, and records
 * each tier reached with its source; returns each achievement's tier before and after.
 */
export async function addCounts(
  db: Kysely<Database>,
  userId: string,
  gameId: string,
  at: Date,
  adds: Map<string, AchievementSource[]>,
): Promise<{ id: string; count: number; before: number; after: number }[]> {
  const out = []
  for (const [id, sources] of adds) {
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
    const count = (row?.count ?? 0) + sources.length
    const after = tierOf(def, count)
    await db
      .insertInto('user_achievements')
      .values({ user_id: userId, achievement_id: id, count, tier: after, showcase_slot: null })
      .onConflict(oc => oc.columns(['user_id', 'achievement_id']).doUpdateSet({ count, tier: after }))
      .execute()
    const reached = crossings(def, row?.count ?? 0, sources)
    if (reached.length > 0) {
      await db
        .insertInto('achievement_tiers')
        .values(
          reached.map(r => ({
            user_id: userId,
            achievement_id: id,
            tier: r.tier,
            reached_at: at,
            game_id: gameId,
            source: JSON.stringify(r.by),
          })),
        )
        .onConflict(oc => oc.doNothing())
        .execute()
    }
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

/**
 * Finished games of a mode that counts with an account seat not counted yet, oldest first. Per seat:
 * a game of guests and bots only is never listed, and a game one of two accounts was counted in
 * still is until the other is.
 */
export async function uncountedGameIds(db: Kysely<Database>): Promise<string[]> {
  const modes = [...new Set(ACHIEVEMENTS.flatMap(modesOf))]
  const rows = await db
    .selectFrom('game_sessions as g')
    .innerJoin('game_players as p', 'p.session_id', 'g.id')
    .select(['g.id', 'g.finished_at'])
    .distinct()
    .where('g.status', '=', 'finished')
    .where(gameCounts('g'))
    .where('g.finished_at', 'is not', null)
    .where('g.game_id', 'in', modes)
    .where('p.user_id', 'is not', null)
    .where('p.bot_level', 'is', null)
    .where(eb =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('achievement_games as a')
            .select('a.game_id')
            .whereRef('a.game_id', '=', 'g.id')
            .whereRef('a.user_id', '=', 'p.user_id'),
        ),
      ),
    )
    .orderBy('g.finished_at')
    .orderBy('g.id')
    .execute()
  return rows.map(r => r.id)
}

/** Whether the tiers from before migration 079 have been looked for (achievements/service.ts `locateTiers`). */
export async function sourcesLocated(db: Kysely<Database>): Promise<boolean> {
  return (await db.selectFrom('achievement_source_backfill').select('done_at').executeTakeFirst()) !== undefined
}

export async function markSourcesLocated(db: Kysely<Database>): Promise<void> {
  await db.insertInto('achievement_source_backfill').defaultValues().execute()
}

/** The tiers whose visit is not known. */
export async function unlocatedTiers(db: Kysely<Database>): Promise<{ userId: string; id: string; tier: number }[]> {
  const rows = await db.selectFrom('achievement_tiers').select(['user_id', 'achievement_id', 'tier']).where('source', 'is', null).execute()
  return rows.map(r => ({ userId: r.user_id, id: r.achievement_id, tier: r.tier }))
}

/** The games counted for these accounts, oldest first, each with which of them it was counted for. */
export async function countedGames(db: Kysely<Database>, userIds: string[]): Promise<{ gameId: string; userIds: string[] }[]> {
  if (userIds.length === 0) return []
  const rows = await db
    .selectFrom('achievement_games as a')
    .innerJoin('game_sessions as g', 'g.id', 'a.game_id')
    .select(['a.game_id', sql<string[]>`array_agg(a.user_id ORDER BY a.user_id)`.as('user_ids')])
    .where('a.user_id', 'in', userIds)
    .groupBy(['a.game_id', 'g.finished_at'])
    .orderBy('g.finished_at')
    .orderBy('a.game_id')
    .execute()
  return rows.map(r => ({ gameId: r.game_id, userIds: r.user_ids }))
}

/** Places a tier whose visit was not known; a tier already placed stays as it is. */
export async function placeTier(
  db: Kysely<Database>,
  t: { userId: string; id: string; tier: number; at: Date; gameId: string; source: AchievementSource },
): Promise<void> {
  await db
    .updateTable('achievement_tiers')
    .set({ reached_at: t.at, game_id: t.gameId, source: JSON.stringify(t.source) })
    .where('user_id', '=', t.userId)
    .where('achievement_id', '=', t.id)
    .where('tier', '=', t.tier)
    .where('source', 'is', null)
    .execute()
}

export type TierRow = {
  id: string
  tier: number
  reachedAt: Date
  source: AchievementSource | null
  /** The game, while it exists and is not invalidated, and only when `viewerId` may open it; else null. */
  gameId: string | null
  /** A game was recorded, and it is deleted or invalidated now. */
  gone: boolean
}

/**
 * Each tier `userId` reached, in order, as `viewerId` sees it: the game is linked only where the viewer
 * may open it (getViewableGame's rule: they played in it, or it is public).
 */
export async function listTiers(db: Kysely<Database>, userId: string, viewerId: string): Promise<TierRow[]> {
  const rows = await db
    .selectFrom('achievement_tiers as t')
    .leftJoin('game_sessions as g', 'g.id', 't.game_id')
    .select(['t.achievement_id', 't.tier', 't.reached_at', 't.source', 't.game_id', 'g.invalidated_at', 'g.visibility'])
    .select(eb =>
      eb
        .exists(
          eb.selectFrom('game_players as p').select('p.seat').whereRef('p.session_id', '=', 't.game_id').where('p.user_id', '=', viewerId),
        )
        .as('seated'),
    )
    .where('t.user_id', '=', userId)
    .orderBy('t.achievement_id')
    .orderBy('t.tier')
    .execute()
  return rows.map(r => {
    const gone = (r.game_id === null && r.source !== null) || r.invalidated_at !== null
    const viewable = r.game_id !== null && !gone && (r.seated || r.visibility === 'public')
    return {
      id: r.achievement_id,
      tier: r.tier,
      reachedAt: r.reached_at,
      source: r.source,
      gameId: viewable ? r.game_id : null,
      gone,
    }
  })
}
