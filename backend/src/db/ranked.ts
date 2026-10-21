import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import {
  PLACEMENT_MATCHES,
  RANKED_MODES,
  START_RATING,
  nextRankIndex,
  performance,
  ratingChange,
  seedRating,
  sideRating,
  type RankedMode,
} from '../shared/ranked.js'

export type RatingRow = {
  mode: RankedMode
  /** Hidden from the player while placing (see the API). */
  rating: number
  /** null while still placing. */
  rankIndex: number | null
  matches: number
  wins: number
  streak: number
}

const fresh = (mode: RankedMode): RatingRow => ({ mode, rating: START_RATING, rankIndex: null, matches: 0, wins: 0, streak: 0 })

/** The player's rating in both modes; a mode they never played starts at START_RATING. */
export async function getRatings(db: Kysely<Database>, userId: string): Promise<Record<RankedMode, RatingRow>> {
  const rows = await db.selectFrom('ranked_ratings').selectAll().where('user_id', '=', userId).execute()
  const out = { '1v1': fresh('1v1'), '2v2': fresh('2v2') }
  for (const r of rows) {
    out[r.mode] = { mode: r.mode, rating: r.rating, rankIndex: r.rank_index, matches: r.matches, wins: r.wins, streak: r.streak }
  }
  return out
}

/** How far each mode's rating moved since `since`, placement matches left out (0 without games since then). */
export async function ratingChangeSince(db: Kysely<Database>, userId: string, since: Date): Promise<Record<RankedMode, number>> {
  const rows = await db
    .selectFrom('ranked_results')
    .select(['mode', sql<number>`sum(rating_after - rating_before)::int`.as('change')])
    .where('user_id', '=', userId)
    .where('created_at', '>=', since)
    .where('placement', '=', false)
    .groupBy('mode')
    .execute()
  const out = { '1v1': 0, '2v2': 0 }
  for (const r of rows) out[r.mode] = r.change
  return out
}

/** The 3-dart average over the last `n` X01 games the player threw in, ranked or not; null without any. */
export async function x01Average(db: Kysely<Database>, userId: string, n = 20): Promise<number | null> {
  const row = await db
    .selectFrom(eb =>
      eb
        .selectFrom('game_players as p')
        .innerJoin('game_sessions as g', 'g.id', 'p.session_id')
        .select([sql<number>`(p.stats->>'average')::float8`.as('average'), sql<number>`(p.stats->>'dartsThrown')::int`.as('darts')])
        .where('p.user_id', '=', userId)
        .where('p.bot_level', 'is', null)
        .where('g.game_id', '=', 'x01')
        .where('g.status', '=', 'finished')
        .where(sql<boolean>`(p.stats->>'dartsThrown')::int > 0`)
        .orderBy('g.finished_at', 'desc')
        .limit(n)
        .as('last'),
    )
    .select(sql<string | null>`sum(average * darts) / nullif(sum(darts), 0)`.as('avg'))
    .executeTakeFirst()
  return row?.avg == null ? null : Number(row.avg)
}

/** The 3-dart average over the last `n` ranked games with one; null before the first. */
export async function onlineAverage(db: Kysely<Database>, userId: string, n = 20): Promise<number | null> {
  const row = await db
    .selectFrom(eb =>
      eb
        .selectFrom('ranked_results')
        .select('average')
        .where('user_id', '=', userId)
        .where('average', 'is not', null)
        .orderBy('created_at', 'desc')
        .limit(n)
        .as('last'),
    )
    .select(sql<string | null>`avg(average)`.as('avg'))
    .executeTakeFirst()
  return row?.avg == null ? null : Math.round(Number(row.avg) * 10) / 10
}

export type RecentRanked = {
  sessionId: string
  mode: RankedMode
  won: boolean
  /** null for one of the player's placement matches (hidden). */
  change: number | null
  at: Date
  /** The other side, with their ratings going into the game (null while they were placing). */
  opponents: { userId: string; name: string; rating: number | null }[]
}

/** The player's last ranked games, newest first, with who they played. */
export async function recentRanked(db: Kysely<Database>, userId: string, limit = 6): Promise<RecentRanked[]> {
  const mine = await db
    .selectFrom('ranked_results')
    .select(['session_id', 'mode', 'won', 'placement', 'rating_before', 'rating_after', 'created_at'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute()
  if (mine.length === 0) return []
  const others = await db
    .selectFrom('ranked_results as r')
    .innerJoin('user as u', 'u.id', 'r.user_id')
    .select(['r.session_id', 'r.user_id', 'r.won', 'r.placement', 'r.rating_before', 'u.name'])
    .where(
      'r.session_id',
      'in',
      mine.map(m => m.session_id),
    )
    .where('r.user_id', '!=', userId)
    .orderBy('u.name')
    .execute()
  return mine.map(m => ({
    sessionId: m.session_id,
    mode: m.mode,
    won: m.won,
    change: m.placement ? null : m.rating_after - m.rating_before,
    at: m.created_at,
    opponents: others
      .filter(o => o.session_id === m.session_id && o.won !== m.won)
      .map(o => ({ userId: o.user_id, name: o.name, rating: o.placement ? null : o.rating_before })),
  }))
}

export type RankedProfile = {
  ratings: (Omit<RatingRow, 'rating'> & { rating: number | null; change30d: number })[]
  onlineAverage: number | null
  recent: (Omit<RecentRanked, 'at'> & { at: string })[]
}

const DAY = 24 * 60 * 60 * 1000

/** The player's ranked profile as the API shows it: ratings in both modes, online average, recent games. */
export async function getRankedProfile(db: Kysely<Database>, userId: string, now: Date): Promise<RankedProfile> {
  const [ratings, change, average, recent] = await Promise.all([
    getRatings(db, userId),
    ratingChangeSince(db, userId, new Date(now.getTime() - 30 * DAY)),
    onlineAverage(db, userId),
    recentRanked(db, userId),
  ])
  return {
    // The rating stays hidden until the player is placed
    ratings: RANKED_MODES.map(mode => {
      const r = ratings[mode]
      return { ...r, rating: r.rankIndex === null ? null : r.rating, change30d: change[mode] }
    }),
    onlineAverage: average,
    recent: recent.map(r => ({ ...r, at: r.at.toISOString() })),
  }
}

export type RankedSide = { won: boolean; players: { userId: string; average: number | null }[] }

/**
 * Moves the ratings for a finished ranked game. Each side is rated on its players' average rating.
 * A ranked player gains or loses the side's stakes; a player still placing moves by their
 * placement score instead (result and the sides' match averages, shared/ranked.ts ratingChange).
 * Someone's first game in a mode starts them from their X01 average. Writes one ranked_results row
 * per player. Recording the same game twice changes nothing.
 */
export async function recordRankedResult(
  db: Kysely<Database>,
  game: { sessionId: string; mode: RankedMode; sides: [RankedSide, RankedSide]; at?: Date },
): Promise<void> {
  const at = game.at ?? new Date()
  await db.transaction().execute(async trx => {
    // A second call for the same game waits here, then finds it done
    await sql`SELECT pg_advisory_xact_lock(hashtext('dartcade.ranked.' || ${game.sessionId}))`.execute(trx)
    const done = await trx.selectFrom('ranked_results').select('user_id').where('session_id', '=', game.sessionId).executeTakeFirst()
    if (done) return
    const userIds = game.sides.flatMap(s => s.players.map(p => p.userId))
    const known = new Set(
      (
        await trx.selectFrom('ranked_ratings').select('user_id').where('mode', '=', game.mode).where('user_id', 'in', userIds).execute()
      ).map(r => r.user_id),
    )
    const newcomers = userIds.filter(id => !known.has(id))
    if (newcomers.length > 0) {
      const seeds = await Promise.all(
        newcomers.map(async user_id => ({ user_id, mode: game.mode, rating: seedRating(await x01Average(trx, user_id)) })),
      )
      await trx
        .insertInto('ranked_ratings')
        .values(seeds)
        .onConflict(oc => oc.columns(['user_id', 'mode']).doNothing())
        .execute()
    }
    const rows = await trx
      .selectFrom('ranked_ratings')
      .selectAll()
      .where('mode', '=', game.mode)
      .where('user_id', 'in', userIds)
      .forUpdate()
      .execute()
    const byUser = new Map(rows.map(r => [r.user_id, r]))
    const row = (userId: string) => {
      const r = byUser.get(userId)
      if (!r) throw new Error(`no ${game.mode} rating for ${userId}`)
      return r
    }
    const ratingOf = (s: RankedSide) => sideRating(s.players.map(p => row(p.userId).rating))
    const averageOf = (s: RankedSide) => {
      const all = s.players.map(p => p.average)
      return all.every(a => a !== null) ? all.reduce((a, b) => a + b, 0) / all.length : null
    }
    for (const [i, side] of game.sides.entries()) {
      const other = game.sides[1 - i]
      const own = ratingOf(side)
      const opp = ratingOf(other)
      const ownAvg = averageOf(side)
      const oppAvg = averageOf(other)
      const perf = ownAvg !== null && oppAvg !== null ? performance(ownAvg, oppAvg) : null
      for (const p of side.players) {
        const r = row(p.userId)
        const placing = r.matches < PLACEMENT_MATCHES
        const change = ratingChange({ rating: own, opponent: opp, won: side.won, placing, performance: perf })
        const rating = Math.max(0, r.rating + change)
        const matches = r.matches + 1
        const rankIndex = matches < PLACEMENT_MATCHES ? null : nextRankIndex(r.rank_index, rating)
        const streak = side.won ? Math.max(0, r.streak) + 1 : Math.min(0, r.streak) - 1
        await trx
          .updateTable('ranked_ratings')
          .set({ rating, rank_index: rankIndex, matches, wins: r.wins + (side.won ? 1 : 0), streak, updated_at: at })
          .where('user_id', '=', p.userId)
          .where('mode', '=', game.mode)
          .execute()
        await trx
          .insertInto('ranked_results')
          .values({
            session_id: game.sessionId,
            user_id: p.userId,
            mode: game.mode,
            won: side.won,
            placement: placing,
            rating_before: r.rating,
            rating_after: rating,
            average: p.average,
            created_at: at,
          })
          .execute()
      }
    }
  })
}
