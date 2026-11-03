// The coach's stored reviews (coach_legs): one row per leg and seat with an account in a coachable
// X01 game, built when the game finishes; missing or stale ones are rebuilt later.
import { sql, type Insertable, type Kysely } from 'kysely'
import type { CoachLegsTable, Database } from '../db/schema.js'
import { getFinishedGame, type HistoryGame } from '../db/history.js'
import { x01AverageSince } from '../db/ranked.js'
import { storedDetail } from '../history/detail.js'
import type { WarnFn } from '../session/replay.js'
import { PROFILE_AVERAGE_DAYS } from '../shared/avgClass.js'
import { coachable, reviewLeg } from '../shared/coach/index.js'

/** Bump when a stored review would come out different: every game's rows are then rebuilt */
export const COACH_VERSION = 8

const UPDATED = [
  'user_id',
  'finished_at',
  'won',
  'ranked',
  'darts',
  'average',
  'low_visits',
  'bad_setups',
  'missed_doubles',
  'clean',
  'opponents',
  'context',
  'review',
  'winner_name',
  'winner_darts',
  'version',
] as const

// The builds under way, so the game end, a request and the backfill build a game once at a time
const building = new Map<string, Promise<void>>()

/** Builds (or rebuilds) the game's rows, unless the coach doesn't review it. */
export async function buildCoachLegs(db: Kysely<Database>, game: HistoryGame, warn: WarnFn): Promise<void> {
  let pending = building.get(game.id)
  if (!pending) {
    pending = build(db, game, warn).finally(() => building.delete(game.id))
    building.set(game.id, pending)
  }
  return pending
}

async function build(db: Kysely<Database>, game: HistoryGame, warn: WarnFn): Promise<void> {
  if (game.invalidated || !coachable(game.game_id, game.config)) return
  const built = await storedDetail(db, game, warn)
  if (built?.detail.mode !== 'x01') return
  const { legs } = built.detail
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
    for (const { leg } of legs) {
      // A leg's review is CPU work: let live sockets in between legs (and so between seats)
      await new Promise(resolve => setImmediate(resolve))
      const review = reviewLeg(legs, leg, s.seat, { startScore, average, opponentName: nameOf })
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
        version: COACH_VERSION,
      })
    }
  }
  // Replaces the game's rows as a whole, so a leg a new version no longer reviews goes too
  await db.transaction().execute(async tx => {
    await tx.deleteFrom('coach_legs').where('game_id', '=', game.id).execute()
    // Over rows another server built meanwhile
    if (rows.length)
      await tx
        .insertInto('coach_legs')
        .values(rows)
        .onConflict(oc =>
          oc.columns(['game_id', 'leg', 'seat']).doUpdateSet(eb => Object.fromEntries(UPDATED.map(c => [c, eb.ref(`excluded.${c}`)]))),
        )
        .execute()
  })
}

/**
 * Finished, valid, coachable games without rows of this version, newest first: the user's (any
 * account's with null), at most `limit`
 */
async function unbuilt(db: Kysely<Database>, userId: string | null, limit?: number): Promise<string[]> {
  const q = db
    .selectFrom('game_sessions as gs')
    .select('gs.id')
    .where('gs.status', '=', 'finished')
    .where('gs.finished_at', 'is not', null)
    .where('gs.invalidated_at', 'is', null)
    .where('gs.game_id', '=', 'x01')
    // coachable(), in SQL
    .where(
      sql<boolean>`coalesce(gs.config->>'inMode', 'straight') = 'straight' and coalesce(gs.config->>'outMode', 'double') = 'double'
        and coalesce(gs.config->>'bullValue', '25_50') = '25_50' and coalesce(gs.config->>'format', 'singles') <> 'teams'`,
    )
    .where(eb =>
      eb.exists(
        eb
          .selectFrom('game_players as gp')
          .select('gp.seat')
          .whereRef('gp.session_id', '=', 'gs.id')
          .where('gp.user_id', userId === null ? 'is not' : '=', userId),
      ),
    )
    .where(eb =>
      eb.not(
        eb.exists(
          eb.selectFrom('coach_legs as c').select('c.game_id').whereRef('c.game_id', '=', 'gs.id').where('c.version', '=', COACH_VERSION),
        ),
      ),
    )
    .orderBy('gs.finished_at', 'desc')
  const rows = await (limit === undefined ? q : q.limit(limit)).execute()
  return rows.map(r => r.id)
}

/** Builds one game, only if `userId` (when given) played in it; a game that fails is warned about
 *  and skipped, so it can't stop the others. */
async function buildById(db: Kysely<Database>, id: string, warn: WarnFn, userId?: string): Promise<void> {
  try {
    const game = await getFinishedGame(db, id)
    if (game && (userId === undefined || game.seats.some(s => s.user_id === userId))) await buildCoachLegs(db, game, warn)
  } catch (err) {
    warn('coach build failed', { id, error: String(err) })
  }
}

/** Builds the rows of one of the user's games that has none of this version yet (a leg asked for
 *  before the game end or the backfill got to it). buildCoachLegs skips an invalid or uncoachable game. */
export async function ensureCoachGame(db: Kysely<Database>, userId: string, id: string, warn: WarnFn): Promise<void> {
  const built = await db
    .selectFrom('coach_legs')
    .select('game_id')
    .where('game_id', '=', id)
    .where('version', '=', COACH_VERSION)
    .executeTakeFirst()
  if (!built) await buildById(db, id, warn, userId)
}

/**
 * Builds the rows of the user's most recent games that have none of this version, at most `max`
 * games per call. Returns how many games it tried.
 */
export async function ensureCoachLegs(db: Kysely<Database>, userId: string, warn: WarnFn, max = 10): Promise<number> {
  const ids = await unbuilt(db, userId, max)
  for (const id of ids) await buildById(db, id, warn)
  return ids.length
}

const BACKFILL_PAUSE_MS = 50

/** Builds every game's missing or stale rows, newest first, pausing between games. Run once at boot. */
export async function backfillCoachLegs(db: Kysely<Database>, warn: WarnFn): Promise<void> {
  // shortcut: a game no account seat threw a dart in gets no rows, so each boot builds it again; fine while that's rare
  for (const id of await unbuilt(db, null)) {
    // A pause, not just a yield: live games and requests come first
    await new Promise(resolve => setTimeout(resolve, BACKFILL_PAUSE_MS))
    await buildById(db, id, warn)
  }
}
