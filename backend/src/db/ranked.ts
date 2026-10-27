import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { groupBy } from '../util/groupBy.js'
import { toAvatar, type Avatar } from './users.js'
import { insertActivity, type ActivityInsert } from './activity.js'
import { rankUpEvent } from '../activity/events.js'
import {
  PLACEMENT_MATCHES,
  START_RATING,
  applyResult,
  rateGame,
  seedRating,
  type RankedMode,
  type RatedSide,
  type RatingState,
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

/** The `ranked_results` rows (as `alias`) of games that still count: a moderator hasn't invalidated them. */
const counts = (alias = 'ranked_results') =>
  sql<boolean>`NOT EXISTS (SELECT 1 FROM game_sessions gi WHERE gi.id = ${sql.ref(`${alias}.session_id`)} AND gi.invalidated_at IS NOT NULL)`

/** How far each mode's rating moved since `since`, placement matches left out (0 without games since then). */
export async function ratingChangeSince(db: Kysely<Database>, userId: string, since: Date): Promise<Record<RankedMode, number>> {
  const rows = await db
    .selectFrom('ranked_results')
    .select(['mode', sql<number>`sum(rating_after - rating_before)::int`.as('change')])
    .where('user_id', '=', userId)
    .where('created_at', '>=', since)
    .where('placement', '=', false)
    .where(counts())
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
        .where('g.invalidated_at', 'is', null)
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
        .where(counts())
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
  opponents: { userId: string; name: string; rating: number | null; avatar: Avatar }[]
}

/** The player's last ranked games, newest first, with who they played. */
export async function recentRanked(db: Kysely<Database>, userId: string, limit = 6): Promise<RecentRanked[]> {
  const mine = await db
    .selectFrom('ranked_results')
    .select(['session_id', 'mode', 'won', 'placement', 'rating_before', 'rating_after', 'created_at'])
    .where('user_id', '=', userId)
    .where(counts())
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute()
  if (mine.length === 0) return []
  const others = await db
    .selectFrom('ranked_results as r')
    .innerJoin('user as u', 'u.id', 'r.user_id')
    .select([
      'r.session_id',
      'r.user_id',
      'r.won',
      'r.placement',
      'r.rating_before',
      'u.name',
      'u.avatar_kind',
      'u.avatar_preset',
      'u.avatar_background',
      'u.avatar_version',
    ])
    .where(
      'r.session_id',
      'in',
      mine.map(m => m.session_id),
    )
    .where('r.user_id', '!=', userId)
    .where(counts('r'))
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
      .map(o => ({ userId: o.user_id, name: o.name, rating: o.placement ? null : o.rating_before, avatar: toAvatar(o) })),
  }))
}

export type RankedSide = RatedSide

/** Held by a mode's game recording and recalculation alike, so neither reads ratings the other is rewriting. */
async function lockMode(trx: Kysely<Database>, mode: RankedMode): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext('dartcade.ranked.mode.' || ${mode}))`.execute(trx)
}

/**
 * Moves the ratings for a finished ranked game (`rateGame`, shared/ranked.ts).
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
    await lockMode(trx, game.mode)
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
    const states = new Map<string, RatingState>(
      rows.map(r => [r.user_id, { rating: r.rating, rankIndex: r.rank_index, matches: r.matches, wins: r.wins, streak: r.streak }]),
    )
    const climbs: ActivityInsert[] = []
    for (const p of rateGame(states, game.sides)) {
      const climb = rankUpEvent(game.sessionId, game.mode, p.userId, p.before.rankIndex, p.after.rankIndex, at)
      if (climb) climbs.push(climb)
      await trx
        .updateTable('ranked_ratings')
        .set({ ...ratingColumns(p.after), updated_at: at })
        .where('user_id', '=', p.userId)
        .where('mode', '=', game.mode)
        .execute()
      await trx
        .insertInto('ranked_results')
        .values({
          session_id: game.sessionId,
          user_id: p.userId,
          mode: game.mode,
          won: p.won,
          placement: p.placement,
          rating_before: p.before.rating,
          rating_after: p.after.rating,
          average: p.average,
          created_at: at,
        })
        .execute()
    }
    await insertActivity(trx, climbs)
  })
}

function ratingColumns(s: RatingState) {
  return { rating: s.rating, rank_index: s.rankIndex, matches: s.matches, wins: s.wins, streak: s.streak }
}

/**
 * Replays a mode's ranked games from the start, in the order they were played, and rewrites every
 * rating (ranked_ratings, and rating_before/after and placement of each ranked_results row) as if
 * the `exclude`d games, and the ones a moderator invalidated, had never counted. Invalidating a game
 * calls this, as ratings depend on game order.
 * A player starts from the seed their first game in the mode recorded (the excluded games included),
 * so their X01 average is never looked at again; a player left with no games loses their rating row
 * and is seeded afresh by their next game. Runs inside `db`'s transaction when it is one.
 */
export async function recalculateRatings(db: Kysely<Database>, mode: RankedMode, exclude: ReadonlySet<string> = new Set()): Promise<void> {
  if (db.isTransaction) return replay(db, mode, exclude)
  await db.transaction().execute(trx => replay(trx, mode, exclude))
}

async function replay(trx: Kysely<Database>, mode: RankedMode, exclude: ReadonlySet<string>): Promise<void> {
  await lockMode(trx, mode)
  const rows = await trx
    .selectFrom('ranked_results as r')
    .innerJoin('game_sessions as gs', 'gs.id', 'r.session_id')
    .select(['r.session_id', 'r.user_id', 'r.won', 'r.average', 'r.rating_before', 'r.rating_after', 'r.created_at', 'gs.invalidated_at'])
    .where('r.mode', '=', mode)
    .orderBy('r.created_at')
    .orderBy('r.session_id')
    .execute()
  const states = new Map<string, RatingState>()
  const lastGame = new Map<string, Date>()
  for (const r of rows) {
    if (!states.has(r.user_id)) states.set(r.user_id, { rating: r.rating_before, rankIndex: null, matches: 0, wins: 0, streak: 0 })
  }
  const games = groupBy(
    rows.filter(r => !exclude.has(r.session_id) && r.invalidated_at === null),
    r => r.session_id,
  )
  for (const [sessionId, players] of games) {
    const side = (won: boolean): RatedSide => ({
      won,
      players: players.filter(p => p.won === won).map(p => ({ userId: p.user_id, average: p.average })),
    })
    const [winners, losers] = [side(true), side(false)]
    // A side's accounts can be gone (their rows cascade away): nothing to rate against, so a
    // survivor keeps the change the game recorded for them
    const outcomes =
      winners.players.length > 0 && losers.players.length > 0
        ? rateGame(states, [winners, losers])
        : players.map(p => {
            const before = states.get(p.user_id) ?? { rating: p.rating_before, rankIndex: null, matches: 0, wins: 0, streak: 0 }
            const after = applyResult(before, p.won, p.rating_after - p.rating_before)
            return { userId: p.user_id, placement: before.matches < PLACEMENT_MATCHES, before, after }
          })
    for (const p of outcomes) {
      states.set(p.userId, p.after)
      lastGame.set(p.userId, players[0]?.created_at ?? new Date())
      await trx
        .updateTable('ranked_results')
        .set({ rating_before: p.before.rating, rating_after: p.after.rating, placement: p.placement })
        .where('session_id', '=', sessionId)
        .where('user_id', '=', p.userId)
        .execute()
    }
  }
  for (const [userId, state] of states) {
    const at = lastGame.get(userId)
    if (at !== undefined) {
      // An upsert: a player whose rating row went away while their games were invalidated gets it back
      const columns = { ...ratingColumns(state), updated_at: at }
      await trx
        .insertInto('ranked_ratings')
        .values({ user_id: userId, mode, ...columns })
        .onConflict(oc => oc.columns(['user_id', 'mode']).doUpdateSet(columns))
        .execute()
    }
  }
  // Nobody is left with a game they were rated on: seeded afresh by their next one
  const rated = [...lastGame.keys()]
  let gone = trx.deleteFrom('ranked_ratings').where('mode', '=', mode)
  if (rated.length > 0) gone = gone.where('user_id', 'not in', rated)
  await gone.execute()
}

/**
 * What matchmaking rates each player at in a mode: their rating (hidden or not), or for a mode
 * they never played, where their first game would start them (their X01 average). `placing`:
 * still in their placement matches.
 */
export async function matchRatings(
  db: Kysely<Database>,
  userIds: string[],
  mode: RankedMode,
): Promise<Map<string, { rating: number; placing: boolean }>> {
  const out = new Map<string, { rating: number; placing: boolean }>()
  if (userIds.length === 0) return out
  const rows = await db
    .selectFrom('ranked_ratings')
    .select(['user_id', 'rating', 'matches'])
    .where('mode', '=', mode)
    .where('user_id', 'in', userIds)
    .execute()
  for (const r of rows) out.set(r.user_id, { rating: r.rating, placing: r.matches < PLACEMENT_MATCHES })
  for (const id of userIds) {
    if (!out.has(id)) out.set(id, { rating: seedRating(await x01Average(db, id)), placing: true })
  }
  return out
}

/** Remembers a game the queue started, so its ratings move when it ends. */
export async function insertRankedMatch(
  db: Kysely<Database>,
  m: { sessionId: string; mode: RankedMode; sides: [string[], string[]] },
): Promise<void> {
  await db
    .insertInto('ranked_matches')
    .values({ session_id: m.sessionId, mode: m.mode, sides: JSON.stringify(m.sides) })
    .execute()
}

/**
 * Moves the ratings for a ranked game once it's finished: the side whose players placed first
 * won; each player's average is their 3-dart average in the game. Returns false when the game
 * isn't a ranked one, or didn't finish (aborted, still running). Safe to call more than once.
 */
export async function recordRankedGame(db: Kysely<Database>, sessionId: string, at?: Date): Promise<boolean> {
  const match = await db
    .selectFrom('ranked_matches as m')
    .innerJoin('game_sessions as g', 'g.id', 'm.session_id')
    .select(['m.mode', 'm.sides', 'g.status', 'g.finished_at'])
    .where('m.session_id', '=', sessionId)
    .executeTakeFirst()
  if (!match || match.status !== 'finished') return false
  const players = await db
    .selectFrom('game_players')
    .select(['user_id', 'placement', sql<number | null>`(stats->>'average')::float8`.as('average')])
    .where('session_id', '=', sessionId)
    .execute()
  const seat = new Map(players.flatMap(p => (p.user_id === null ? [] : [[p.user_id, p] as const])))
  const sides = match.sides.map(userIds => ({
    won: userIds.some(id => seat.get(id)?.placement === 1),
    players: userIds.map(userId => ({ userId, average: seat.get(userId)?.average ?? null })),
  }))
  // A finished game has exactly one winning side
  if (sides.filter(s => s.won).length !== 1) return false
  await recordRankedResult(db, {
    sessionId,
    mode: match.mode,
    sides: [sides[0], sides[1]],
    at: at ?? match.finished_at ?? undefined,
  })
  return true
}

/** Finished ranked games whose ratings haven't moved yet (they ended while the server was down). */
export async function unrecordedRankedGames(db: Kysely<Database>): Promise<string[]> {
  const rows = await db
    .selectFrom('ranked_matches as m')
    .innerJoin('game_sessions as g', 'g.id', 'm.session_id')
    .select('m.session_id')
    .where('g.status', '=', 'finished')
    .where(eb => eb.not(eb.exists(eb.selectFrom('ranked_results as r').select('r.user_id').whereRef('r.session_id', '=', 'm.session_id'))))
    .execute()
  return rows.map(r => r.session_id)
}
