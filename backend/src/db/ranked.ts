import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { groupBy } from '../util/groupBy.js'
import { toAvatar, type Avatar } from './users.js'
import { insertActivity, type ActivityInsert } from './activity.js'
import { rankUpEvent } from '../activity/events.js'
import {
  PLACEMENT_MATCHES,
  START_RATING,
  applyAdjustment,
  applyResult,
  rateGame,
  seedRating,
  type RankedMode,
  type RatedSide,
  type RatingAdjustment,
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
export const counts = (alias = 'ranked_results') =>
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

/** The player's finished, valid X01 games with darts thrown, newest first: their average and darts. */
const x01Games = (db: Kysely<Database>, userId: string) =>
  db
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

const dartWeighted = sql<string | null>`sum(average * darts) / nullif(sum(darts), 0)`

/** The 3-dart average over the last `n` X01 games the player threw in, ranked or not; null without any. */
export async function x01Average(db: Kysely<Database>, userId: string, n = 20): Promise<number | null> {
  const row = await db.selectFrom(x01Games(db, userId).limit(n).as('last')).select(dartWeighted.as('avg')).executeTakeFirst()
  return row?.avg == null ? null : Number(row.avg)
}

/** The 3-dart average over the X01 games finished in the `days` days up to `until` (default now); null without any. */
export async function x01AverageSince(db: Kysely<Database>, userId: string, days: number, until?: Date): Promise<number | null> {
  const end = until ? sql<Date>`${until}::timestamptz` : sql<Date>`now()`
  const row = await db
    .selectFrom(
      x01Games(db, userId)
        .where('g.finished_at', '>=', sql<Date>`${end} - make_interval(days => ${days})`)
        .where('g.finished_at', '<=', end)
        .as('recent'),
    )
    .select(dartWeighted.as('avg'))
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

/** A side as a game records it: who played, their average, and whose seat forfeited. */
export type RankedSide = { won: boolean; players: { userId: string; average: number | null; forfeited?: boolean }[] }

/** Held by a mode's game recording and recalculation alike, so neither reads ratings the other is rewriting. */
async function lockMode(trx: Kysely<Database>, mode: RankedMode): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext('dartcade.ranked.mode.' || ${mode}))`.execute(trx)
}

/**
 * Moves the ratings for a finished ranked game (`rateGame`, shared/ranked.ts).
 * Someone's first game in a mode starts them from `seeds` (the rating they were matched on), else
 * from their X01 average. A game with a forfeit is rated on the result alone. Writes one
 * ranked_results row per player. Recording the same game twice changes nothing. Runs inside `db`'s
 * transaction when it is one.
 */
export async function recordRankedResult(
  db: Kysely<Database>,
  game: {
    sessionId: string
    mode: RankedMode
    sides: [RankedSide, RankedSide]
    seeds?: Record<string, number>
    at?: Date
    quiet?: boolean
  },
): Promise<void> {
  const at = game.at ?? new Date()
  const write = async (trx: Kysely<Database>) => {
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
        newcomers.map(async user_id => ({
          user_id,
          mode: game.mode,
          rating: game.seeds?.[user_id] ?? seedRating(await x01Average(trx, user_id)),
        })),
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
    const forfeited = new Set(game.sides.flatMap(s => s.players.filter(p => p.forfeited).map(p => p.userId)))
    const averages = new Map(game.sides.flatMap(s => s.players.map(p => [p.userId, p.average] as const)))
    // A forfeit says nothing about how they threw: the result alone rates the game
    const sides = game.sides.map(s => ({
      won: s.won,
      players: s.players.map(p => ({ userId: p.userId, average: forfeited.size > 0 ? null : p.average })),
    }))
    const climbs: ActivityInsert[] = []
    for (const p of rateGame(states, [sides[0], sides[1]])) {
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
          forfeited: forfeited.has(p.userId),
          rank_before: p.before.rankIndex,
          rank_after: p.after.rankIndex,
          average: averages.get(p.userId) ?? null,
          created_at: at,
        })
        .execute()
    }
    // `quiet`: the game doesn't count (a moderator invalidated it), so friends hear nothing of it
    if (!game.quiet) await insertActivity(trx, climbs)
  }
  // Inside the caller's transaction when it is one
  if (db.isTransaction) await write(db)
  else await db.transaction().execute(write)
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
 * and is seeded afresh by their next game. An admin's adjustment (`ranked_adjustments`) is applied between
 * the games it falls between. Runs inside `db`'s transaction when it is one.
 */
export async function recalculateRatings(db: Kysely<Database>, mode: RankedMode, exclude: ReadonlySet<string> = new Set()): Promise<void> {
  if (db.isTransaction) return replay(db, mode, exclude)
  await db.transaction().execute(trx => replay(trx, mode, exclude))
}

/** Rows per statement: well under Postgres' 65 535 bind parameters, and big enough that a replay is a handful of round trips. */
const WRITE_CHUNK = 2000

function* chunks<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size)
}

type ResultRewrite = {
  session_id: string
  user_id: string
  rating_before: number
  rating_after: number
  rank_before: number | null
  rank_after: number | null
  placement: boolean
}

/** Rewrites the rated columns of many ranked_results rows with one UPDATE ... FROM per chunk, not one per row. */
async function rewriteResults(trx: Kysely<Database>, rows: readonly ResultRewrite[]): Promise<void> {
  for (const c of chunks(rows, WRITE_CHUNK)) {
    await sql`
      UPDATE ranked_results r SET
        rating_before = v.rating_before, rating_after = v.rating_after,
        rank_before = v.rank_before, rank_after = v.rank_after, placement = v.placement
      FROM unnest(
        ${c.map(r => r.session_id)}::text[], ${c.map(r => r.user_id)}::text[],
        ${c.map(r => r.rating_before)}::int[], ${c.map(r => r.rating_after)}::int[],
        ${c.map(r => r.rank_before)}::int[], ${c.map(r => r.rank_after)}::int[],
        ${c.map(r => r.placement)}::boolean[]
      ) AS v(session_id, user_id, rating_before, rating_after, rank_before, rank_after, placement)
      WHERE r.session_id = v.session_id AND r.user_id = v.user_id`.execute(trx)
  }
}

async function replay(trx: Kysely<Database>, mode: RankedMode, exclude: ReadonlySet<string>): Promise<void> {
  await lockMode(trx, mode)
  const rows = await trx
    .selectFrom('ranked_results as r')
    .innerJoin('game_sessions as gs', 'gs.id', 'r.session_id')
    .select([
      'r.session_id',
      'r.user_id',
      'r.won',
      'r.average',
      'r.forfeited',
      'r.rating_before',
      'r.rating_after',
      'r.created_at',
      'gs.invalidated_at',
    ])
    .where('r.mode', '=', mode)
    .orderBy('r.created_at')
    .orderBy('r.session_id')
    .execute()
  const rewrites: ResultRewrite[] = []
  const states = new Map<string, RatingState>()
  const lastGame = new Map<string, Date>()
  for (const r of rows) {
    if (!states.has(r.user_id)) states.set(r.user_id, { rating: r.rating_before, rankIndex: null, matches: 0, wins: 0, streak: 0 })
  }
  const games = groupBy(
    rows.filter(r => !exclude.has(r.session_id) && r.invalidated_at === null),
    r => r.session_id,
  )
  const adjustments = await trx
    .selectFrom('ranked_adjustments')
    .select(['user_id', 'kind', 'rating', 'created_at'])
    .where('mode', '=', mode)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  let nextAdjustment = 0
  // Applied between the games they fall between, so no later replay erases them
  const adjustUntil = (until: Date | null) => {
    for (; nextAdjustment < adjustments.length; nextAdjustment++) {
      const a = adjustments[nextAdjustment]
      if (until !== null && a.created_at > until) return
      const before = states.get(a.user_id) ?? { rating: START_RATING, rankIndex: null, matches: 0, wins: 0, streak: 0 }
      states.set(
        a.user_id,
        applyAdjustment(before, a.kind === 'set' ? { kind: 'set', rating: a.rating ?? START_RATING } : { kind: 'reset' }),
      )
      lastGame.set(a.user_id, a.created_at)
    }
  }
  for (const [sessionId, players] of games) {
    adjustUntil(players[0]?.created_at ?? null)
    const forfeit = players.some(p => p.forfeited)
    const side = (won: boolean): RatedSide => ({
      won,
      players: players.filter(p => p.won === won).map(p => ({ userId: p.user_id, average: forfeit ? null : p.average })),
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
      rewrites.push({
        session_id: sessionId,
        user_id: p.userId,
        rating_before: p.before.rating,
        rating_after: p.after.rating,
        rank_before: p.before.rankIndex,
        rank_after: p.after.rankIndex,
        placement: p.placement,
      })
    }
  }
  adjustUntil(null)
  await rewriteResults(trx, rewrites)
  // An upsert: a player whose rating row went away while their games were invalidated gets it back
  const ratings = [...states].flatMap(([userId, state]) => {
    const at = lastGame.get(userId)
    return at === undefined ? [] : [{ user_id: userId, mode, ...ratingColumns(state), updated_at: at }]
  })
  for (const chunk of chunks(ratings, WRITE_CHUNK)) {
    await trx
      .insertInto('ranked_ratings')
      .values(chunk)
      .onConflict(oc =>
        oc.columns(['user_id', 'mode']).doUpdateSet(eb => ({
          rating: eb.ref('excluded.rating'),
          rank_index: eb.ref('excluded.rank_index'),
          matches: eb.ref('excluded.matches'),
          wins: eb.ref('excluded.wins'),
          streak: eb.ref('excluded.streak'),
          updated_at: eb.ref('excluded.updated_at'),
        })),
      )
      .execute()
  }
  // Nobody is left with a game they were rated on: seeded afresh by their next one
  const rated = [...lastGame.keys()]
  await trx
    .deleteFrom('ranked_ratings')
    .where('mode', '=', mode)
    .where(sql<boolean>`NOT (user_id = ANY(${rated}::text[]))`)
    .execute()
}

export type MatchRating = { rating: number; rankIndex: number | null; matches: number; placing: boolean }

/**
 * What matchmaking rates each player at in a mode: their rating (hidden or not), or for a mode
 * they never played, where their first game would start them (their X01 average). `placing`:
 * still in their placement matches; `matches` and `rankIndex` are what the match screen shows.
 */
export async function matchRatings(db: Kysely<Database>, userIds: string[], mode: RankedMode): Promise<Map<string, MatchRating>> {
  const out = new Map<string, MatchRating>()
  if (userIds.length === 0) return out
  const rows = await db
    .selectFrom('ranked_ratings')
    .select(['user_id', 'rating', 'rank_index', 'matches'])
    .where('mode', '=', mode)
    .where('user_id', 'in', userIds)
    .execute()
  for (const r of rows)
    out.set(r.user_id, { rating: r.rating, rankIndex: r.rank_index, matches: r.matches, placing: r.matches < PLACEMENT_MATCHES })
  for (const id of userIds) {
    if (!out.has(id)) out.set(id, { rating: seedRating(await x01Average(db, id)), rankIndex: null, matches: 0, placing: true })
  }
  return out
}

/**
 * Moves the ratings for a ranked game once it's finished. The winning side is the one whose seat
 * the engine placed first (seats are the two sides in order, so a deleted account does not hide
 * it); each player's average is their 3-dart average in the game, and a seat that forfeited says so.
 * A game that can't be rated (no unique winner, a side whose accounts are all gone) is marked void
 * with the reason, not retried. A game a moderator invalidated before it was recorded is recorded
 * and left out again at once. Returns false when nothing was rated: not a ranked game, still
 * running or aborted, or void. Safe to call more than once.
 */
export async function recordRankedGame(db: Kysely<Database>, sessionId: string, at?: Date): Promise<boolean> {
  const match = await db
    .selectFrom('ranked_matches as m')
    .innerJoin('game_sessions as g', 'g.id', 'm.session_id')
    .select(['m.mode', 'm.sides', 'm.entries', 'm.void_reason', 'g.status', 'g.finished_at', 'g.invalidated_at'])
    .where('m.session_id', '=', sessionId)
    .executeTakeFirst()
  if (!match || match.status !== 'finished' || match.void_reason !== null) return false
  const seats = await db
    .selectFrom('game_players')
    .select(['seat', 'placement', 'forfeited', sql<number | null>`(stats->>'average')::float8`.as('average')])
    .where('session_id', '=', sessionId)
    .execute()
  const alive = new Set((await db.selectFrom('user').select('id').where('id', 'in', match.sides.flat()).execute()).map(u => u.id))
  // Seats are the first side's players, then the second's
  const split = match.sides[0].length
  const sideOf = (seat: number) => (seat < split ? 0 : 1)
  const won = [0, 1].map(i => seats.some(s => sideOf(s.seat) === i && s.placement === 1))
  const players = (i: 0 | 1) =>
    match.sides[i].flatMap((userId, k) => {
      const s = seats.find(x => x.seat === (i === 0 ? k : split + k))
      return alive.has(userId) ? [{ userId, average: s?.average ?? null, forfeited: s?.forfeited ?? false }] : []
    })
  const sides: [RankedSide, RankedSide] = [
    { won: won[0], players: players(0) },
    { won: won[1], players: players(1) },
  ]
  const reason = won[0] === won[1] ? 'no_winner' : sides[0].players.length === 0 || sides[1].players.length === 0 ? 'player_deleted' : null
  if (reason !== null) {
    await db.updateTable('ranked_matches').set({ void_reason: reason }).where('session_id', '=', sessionId).execute()
    return false
  }
  const game = {
    sessionId,
    mode: match.mode,
    sides,
    seeds: Object.fromEntries(Object.entries(match.entries).map(([id, e]) => [id, e.rating])),
    at: at ?? match.finished_at ?? undefined,
  }
  if (match.invalidated_at === null) await recordRankedResult(db, game)
  else {
    // It doesn't count: written, left out of the ratings again and kept out of the friends' feed,
    // all or nothing (ratings depend on the order of the games, so it's a replay)
    await db.transaction().execute(async trx => {
      await recordRankedResult(trx, { ...game, quiet: true })
      await recalculateRatings(trx, match.mode)
    })
  }
  return true
}

/** What a recorded ranked game did to a player: the RP it moved (null for a placement match, whose rating is hidden) and their rank going in and out. */
export type RankedOutcome = { userId: string; change: number | null; rankIndexBefore: number | null; rankIndexAfter: number | null }

/** The recorded outcome for each player of a ranked game; none until it's recorded. */
export async function rankedOutcomes(db: Kysely<Database>, sessionId: string): Promise<RankedOutcome[]> {
  const rows = await db
    .selectFrom('ranked_results')
    .select(['user_id', 'placement', 'rating_before', 'rating_after', 'rank_before', 'rank_after'])
    .where('session_id', '=', sessionId)
    .execute()
  return rows.map(r => ({
    userId: r.user_id,
    change: r.placement ? null : r.rating_after - r.rating_before,
    rankIndexBefore: r.rank_before,
    rankIndexAfter: r.rank_after,
  }))
}

/** Finished ranked games whose ratings haven't moved yet (they ended while the server was down). */
export async function unrecordedRankedGames(db: Kysely<Database>): Promise<string[]> {
  const rows = await db
    .selectFrom('ranked_matches as m')
    .innerJoin('game_sessions as g', 'g.id', 'm.session_id')
    .select('m.session_id')
    .where('g.status', '=', 'finished')
    .where('m.void_reason', 'is', null)
    .where(eb => eb.not(eb.exists(eb.selectFrom('ranked_results as r').select('r.user_id').whereRef('r.session_id', '=', 'm.session_id'))))
    .execute()
  return rows.map(r => r.session_id)
}

export type RatingSnapshot = { rating: number; rankIndex: number | null; matches: number }

/**
 * An admin sets a player's rating in a mode, or sends them back to placement, and the mode is
 * replayed so the adjustment sits in the order of the games. Returns their rating before and
 * after; null when the account doesn't exist. Writes the `ranked.adjust` / `ranked.reset` audit row.
 */
export async function adjustRating(
  db: Kysely<Database>,
  adminUserId: string,
  userId: string,
  change: { mode: RankedMode; reason: string } & RatingAdjustment,
): Promise<{ before: RatingSnapshot; after: RatingSnapshot } | null> {
  return db.transaction().execute(async trx => {
    if (!(await trx.selectFrom('user').select('id').where('id', '=', userId).executeTakeFirst())) return null
    await lockMode(trx, change.mode)
    const snapshot = async (): Promise<RatingSnapshot> => {
      const { rating, rankIndex, matches } = (await getRatings(trx, userId))[change.mode]
      return { rating, rankIndex, matches }
    }
    const before = await snapshot()
    await trx
      .insertInto('ranked_adjustments')
      .values({
        user_id: userId,
        mode: change.mode,
        kind: change.kind,
        rating: change.kind === 'set' ? change.rating : null,
        reason: change.reason,
        admin_user_id: adminUserId,
        created_at: new Date(),
      })
      .execute()
    await recalculateRatings(trx, change.mode)
    const after = await snapshot()
    await trx
      .insertInto('admin_audit')
      .values({
        admin_user_id: adminUserId,
        action: change.kind === 'set' ? 'ranked.adjust' : 'ranked.reset',
        target: userId,
        detail: JSON.stringify({ mode: change.mode, reason: change.reason, before, after }),
      })
      .execute()
    return { before, after }
  })
}
