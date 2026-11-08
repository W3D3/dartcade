// The coach's stored reviews (coach_legs): one row per leg and seat with an account in a coachable
// X01 game, built when the game finishes; missing or stale ones are rebuilt later. A game's marker
// (coach_games) says which COACH_VERSION built its rows, and whether it was built at all. Each row
// keeps the coach target its player had (coach_legs.target): once they pick another, the row is
// stale and its game is rebuilt the same way, so a new target regrades their legs.
import { sql, type Insertable, type Kysely } from 'kysely'
import type { CoachLegsTable, Database } from '../db/schema.js'
import { getFinishedGame, type HistoryGame } from '../db/history.js'
import { x01AverageSince } from '../db/ranked.js'
import { getPreferences } from '../db/users.js'
import { storedDetail } from '../history/detail.js'
import type { WarnFn } from '../session/replay.js'
import { PROFILE_AVERAGE_DAYS } from '../shared/avgClass.js'
import { coachable, loadCoachModels, reviewLeg, targetTier } from '../shared/coach/index.js'
import { coachDart } from '../shared/coach/walk.js'

/** Bump when a stored review would come out different: every game's rows are then rebuilt */
export const COACH_VERSION = 32

/** The current coach target of a coach_legs row's player (`cl`): their preference, auto when unset */
export const currentTarget = sql<string>`coalesce((SELECT u.preferences->>'coachTarget' FROM "user" u WHERE u.id = cl.user_id), 'auto')`

/** Builds (or rebuilds) the game's rows and marks it built at this version (coach_games), even when
 *  the coach reviews none of it. An invalidated game is left unmarked, so restoring it builds it. A
 *  game a newer COACH_VERSION built (another server on the same database) is left alone. */
export async function buildCoachLegs(db: Kysely<Database>, game: HistoryGame, warn: WarnFn): Promise<void> {
  if (game.invalidated) return
  const rows = await reviewRows(db, game, warn)
  // Replaces the game's rows as a whole, so a leg a new version no longer reviews goes too. The lock
  // serializes overlapping builds of one game (game end, a request, the backfill): the last one wins.
  await db.transaction().execute(async tx => {
    await sql`SELECT pg_advisory_xact_lock(hashtext('dartcade.coach.' || ${game.id}))`.execute(tx)
    const newer = await tx
      .selectFrom('coach_games')
      .select('version')
      .where('game_id', '=', game.id)
      .where('version', '>', COACH_VERSION)
      .executeTakeFirst()
    if (newer) return
    await tx.deleteFrom('coach_legs').where('game_id', '=', game.id).execute()
    if (rows.length) await tx.insertInto('coach_legs').values(rows).execute()
    await tx
      .insertInto('coach_games')
      .values({ game_id: game.id, version: COACH_VERSION })
      .onConflict(oc => oc.column('game_id').doUpdateSet({ version: COACH_VERSION, built_at: new Date() }))
      .execute()
  })
}

/** The game's rows, one per leg and seat with an account; none when the coach doesn't review it. */
async function reviewRows(db: Kysely<Database>, game: HistoryGame, warn: WarnFn): Promise<Insertable<CoachLegsTable>[]> {
  if (!coachable(game.game_id, game.config)) return []
  const built = await storedDetail(db, game, warn)
  if (built?.detail.mode !== 'x01') return []
  const { legs } = built.detail
  const coachLegs = legs.map(l => ({ ...l, visits: l.visits.map(v => ({ ...v, darts: v.darts.map(coachDart) })) }))
  const extra = await db
    .selectFrom('game_sessions as gs')
    .leftJoin('lobbies as l', 'l.id', 'gs.lobby_id')
    .leftJoin('ranked_matches as rm', 'rm.session_id', 'gs.id')
    .select(['l.name as lobby', 'rm.mode as ranked'])
    .where('gs.id', '=', game.id)
    .executeTakeFirst()
  const startScore = typeof game.config.startScore === 'number' ? game.config.startScore : 501
  const head = extra?.ranked ? `Ranked ${extra.ranked}` : [startScore, extra?.lobby].filter(Boolean).join(' · ')
  const nameOf = (seat: number) => game.seats.find(s => s.seat === seat)?.name ?? `Player ${seat + 1}`
  // Who won each leg and their darts in it, from the same stored detail the review walks; null
  // when the round limit cut the leg short (no winner). The name's source is the same raw
  // game.seats lookup opponents uses below, not nameOf's "Player N" fallback.
  const winners = new Map<number, { name: string | null; darts: number | null }>(
    legs.map(l => [
      l.leg,
      l.winner === null
        ? { name: null, darts: null }
        : {
            name: game.seats.find(gs => gs.seat === l.winner)?.name ?? null,
            darts: l.visits.filter(v => v.seat === l.winner).reduce((sum, v) => sum + v.darts.length, 0),
          },
    ]),
  )

  const rows: Insertable<CoachLegsTable>[] = []
  for (const s of game.seats) {
    if (s.user_id === null || s.bot_level !== null) continue
    // The player's average when the game finished, so a rebuild grades it the same
    const average = await x01AverageSince(db, s.user_id, PROFILE_AVERAGE_DAYS, game.finished_at)
    // Graded as the tier the player picked, or on auto the one that average suggests; the review
    // stores the tier, so it doesn't shift with the average later
    const target = (await getPreferences(db, s.user_id))?.coachTarget ?? 'auto'
    const models = await loadCoachModels(targetTier(target, average))
    for (const { leg } of legs) {
      // A leg's review is CPU work: let live sockets in between legs (and so between seats)
      await new Promise(resolve => setImmediate(resolve))
      const review = reviewLeg(coachLegs, leg, s.seat, { startScore, average, models, opponentName: nameOf })
      if (!review) continue
      const winner = winners.get(leg) ?? { name: null, darts: null }
      rows.push({
        user_id: s.user_id,
        game_id: game.id,
        leg,
        seat: s.seat,
        finished_at: game.finished_at,
        won: review.won,
        ranked: Boolean(extra?.ranked),
        darts: review.darts,
        average: review.average,
        low_visits: review.counts.lowVisits,
        bad_setups: review.counts.badSetups,
        missed_doubles: review.counts.missedDoubles,
        clean: review.counts.clean,
        opponents: JSON.stringify(game.seats.filter(o => o.seat !== s.seat).map(o => o.name)),
        context: `${head} · leg ${leg + 1}`,
        review: JSON.stringify(review),
        winner_name: winner.name,
        winner_darts: winner.darts,
        target,
      })
    }
  }
  return rows
}

// Games whose build threw in this process: warned about once and skipped until the next boot, so
// they don't take a slot of every request's cap (nothing is recorded, a restart retries them)
const failed = new Set<string>()

/**
 * Finished, valid X01 games not built at this version (or a newer one), or built at this version
 * with a row of the user's (any account's with null) graded for a coach target they no longer have,
 * newest first: the user's (any account's with null), at most `limit`. Whether the coach reviews one
 * is coachable()'s call in buildCoachLegs, which marks the others with no rows.
 */
async function unbuilt(db: Kysely<Database>, userId: string | null, limit?: number, recent?: number): Promise<string[]> {
  let q = db
    .selectFrom('game_sessions as gs')
    .select('gs.id')
    .where('gs.status', '=', 'finished')
    .where('gs.finished_at', 'is not', null)
    .where('gs.invalidated_at', 'is', null)
    .where('gs.game_id', '=', 'x01')
    .where(eb =>
      eb.exists(
        eb
          .selectFrom('game_players as gp')
          .select('gp.seat')
          .whereRef('gp.session_id', '=', 'gs.id')
          .where('gp.user_id', userId === null ? 'is not' : '=', userId),
      ),
    )
    .where(eb => {
      const marker = (op: '>=' | '=') =>
        eb.exists(
          eb.selectFrom('coach_games as c').select('c.game_id').whereRef('c.game_id', '=', 'gs.id').where('c.version', op, COACH_VERSION),
        )
      let stale = eb
        .selectFrom('coach_legs as cl')
        .select('cl.seat')
        .whereRef('cl.game_id', '=', 'gs.id')
        .where('cl.target', '<>', currentTarget)
      if (userId !== null) stale = stale.where('cl.user_id', '=', userId)
      return eb.or([eb.not(marker('>=')), eb.and([marker('='), eb.exists(stale)])])
    })
    .orderBy('gs.finished_at', 'desc')
  if (failed.size) q = q.where('gs.id', 'not in', [...failed])
  // Only among the user's `recent` latest finished X01 games
  if (recent !== undefined && userId !== null)
    q = q.where('gs.id', 'in', eb =>
      eb
        .selectFrom('game_sessions as r')
        .select('r.id')
        .where('r.status', '=', 'finished')
        .where('r.finished_at', 'is not', null)
        .where('r.invalidated_at', 'is', null)
        .where('r.game_id', '=', 'x01')
        .where(e =>
          e.exists(
            e.selectFrom('game_players as rp').select('rp.seat').whereRef('rp.session_id', '=', 'r.id').where('rp.user_id', '=', userId),
          ),
        )
        .orderBy('r.finished_at', 'desc')
        .limit(recent),
    )
  const rows = await (limit === undefined ? q : q.limit(limit)).execute()
  return rows.map(r => r.id)
}

/** Builds one game, only if `userId` (when given) played in it; a game that fails is warned about
 *  and skipped, so it can't stop the others. */
async function buildById(db: Kysely<Database>, id: string, warn: WarnFn, userId?: string): Promise<void> {
  if (failed.has(id)) return
  try {
    const game = await getFinishedGame(db, id)
    if (game && (userId === undefined || game.seats.some(s => s.user_id === userId))) await buildCoachLegs(db, game, warn)
  } catch (err) {
    failed.add(id)
    warn('coach build failed', { id, error: String(err) })
  }
}

/** Builds one of the user's games not built at this version (or a newer one) yet, or whose rows of
 *  theirs were graded for another coach target (a leg asked for before the game end, the backfill
 *  or the list got to it). buildCoachLegs skips an invalid game. */
export async function ensureCoachGame(db: Kysely<Database>, userId: string, id: string, warn: WarnFn): Promise<void> {
  const built = await db
    .selectFrom('coach_games')
    .select('game_id')
    .where('game_id', '=', id)
    .where('version', '>=', COACH_VERSION)
    .executeTakeFirst()
  const stale = await db
    .selectFrom('coach_legs as cl')
    .select('cl.seat')
    .where('cl.game_id', '=', id)
    .where('cl.user_id', '=', userId)
    .where('cl.target', '<>', currentTarget)
    .executeTakeFirst()
  if (!built || stale) await buildById(db, id, warn, userId)
}

/**
 * Builds the user's most recent games not built at this version, at most `max`
 * games per call. Returns how many games it tried.
 */
export async function ensureCoachLegs(db: Kysely<Database>, userId: string, warn: WarnFn, max = 10): Promise<number> {
  const ids = await unbuilt(db, userId, max)
  for (const id of ids) await buildById(db, id, warn)
  return ids.length
}

/** How many of the user's 50 latest finished X01 games (about the coach page's 50 legs) still wait for
 *  a review at this version: the page says so and asks again, each request building up to 10. */
export async function pendingCoachGames(db: Kysely<Database>, userId: string): Promise<number> {
  return (await unbuilt(db, userId, undefined, 50)).length
}

const BACKFILL_PAUSE_MS = 50

/** Builds every game not built at this version, newest first, pausing between games. Run once at boot. */
export async function backfillCoachLegs(db: Kysely<Database>, warn: WarnFn): Promise<void> {
  for (const id of await unbuilt(db, null)) {
    // A pause, not just a yield: live games and requests come first
    await new Promise(resolve => setTimeout(resolve, BACKFILL_PAUSE_MS))
    await buildById(db, id, warn)
  }
}
