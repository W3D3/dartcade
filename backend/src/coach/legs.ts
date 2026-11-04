// Reads over coach_legs for the coach page: the counts strip, the filtered/paged leg list and one
// leg's stored review. A game a moderator invalidated after its rows were built stays out of both
// (coach_legs isn't cleaned up on invalidation, so every read joins game_sessions to check).
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { LegReview } from '../shared/coach/review.js'
import { type CoachCursor } from './cursor.js'
import { COACH_VERSION } from './store.js'

export type CoachLegFilter = 'all' | 'lost' | 'ranked' | 'missedDoubles' | 'badSetups' | 'lowVisits'
export type CoachLegRow = {
  gameId: string
  leg: number
  finishedAt: Date
  opponents: string[]
  context: string
  won: boolean
  darts: number
  average: number | null
  lowVisits: number
  badSetups: number
  missedDoubles: number
  clean: boolean
}
export type CoachLegCounts = { legs: number; lowVisits: number; badSetups: number; missedDoubles: number; cleanLegs: number }

/** Legs over the last 50 stored legs, not invalidated. */
const COUNTS_WINDOW = 50
const PAGE_SIZE = 40

function base(db: Kysely<Database>, userId: string) {
  return (
    db
      .selectFrom('coach_legs as cl')
      .innerJoin('game_sessions as gs', 'gs.id', 'cl.game_id')
      // A stale row (its game built by another COACH_VERSION) is missing until the game is rebuilt, in every read
      .innerJoin('coach_games as cg', join => join.onRef('cg.game_id', '=', 'cl.game_id').on('cg.version', '=', COACH_VERSION))
      .where('cl.user_id', '=', userId)
      .where('gs.invalidated_at', 'is', null)
  )
}

/** Counts over the user's 50 most recent stored legs (finished_at desc), and when the newest of
 *  them finished; null counts and updatedAt when the user has none. */
export async function coachLegsSummary(db: Kysely<Database>, userId: string): Promise<{ counts: CoachLegCounts; updatedAt: Date | null }> {
  const rows = await base(db, userId)
    .select(['cl.finished_at', 'cl.low_visits', 'cl.bad_setups', 'cl.missed_doubles', 'cl.clean'])
    .orderBy('cl.finished_at', 'desc')
    .orderBy('cl.game_id', 'desc')
    .orderBy('cl.leg', 'desc')
    .limit(COUNTS_WINDOW)
    .execute()
  return {
    counts: {
      legs: rows.length,
      lowVisits: rows.reduce((s, r) => s + r.low_visits, 0),
      badSetups: rows.reduce((s, r) => s + r.bad_setups, 0),
      missedDoubles: rows.reduce((s, r) => s + r.missed_doubles, 0),
      cleanLegs: rows.filter(r => r.clean).length,
    },
    updatedAt: rows[0]?.finished_at ?? null,
  }
}

/** A page of up to 40 of the user's legs, newest first, filtered server-side; `next` is the next
 *  page's cursor, or null past the last one. */
export async function coachLegsPage(
  db: Kysely<Database>,
  userId: string,
  filter: CoachLegFilter,
  after: CoachCursor | null,
): Promise<{ rows: CoachLegRow[]; next: CoachCursor | null }> {
  let q = base(db, userId).select([
    'cl.game_id',
    'cl.leg',
    'cl.finished_at',
    'cl.opponents',
    'cl.context',
    'cl.won',
    'cl.darts',
    'cl.average',
    'cl.low_visits',
    'cl.bad_setups',
    'cl.missed_doubles',
    'cl.clean',
  ])
  if (filter === 'lost') q = q.where('cl.won', '=', false)
  else if (filter === 'ranked') q = q.where('cl.ranked', '=', true)
  else if (filter === 'missedDoubles') q = q.where('cl.missed_doubles', '>', 0)
  else if (filter === 'badSetups') q = q.where('cl.bad_setups', '>', 0)
  else if (filter === 'lowVisits') q = q.where('cl.low_visits', '>', 0)
  if (after) {
    const a = after
    q = q.where(eb =>
      eb.or([
        eb('cl.finished_at', '<', a.finishedAt),
        eb.and([eb('cl.finished_at', '=', a.finishedAt), eb('cl.game_id', '<', a.gameId)]),
        eb.and([eb('cl.finished_at', '=', a.finishedAt), eb('cl.game_id', '=', a.gameId), eb('cl.leg', '<', a.leg)]),
      ]),
    )
  }
  const rows = await q
    .orderBy('cl.finished_at', 'desc')
    .orderBy('cl.game_id', 'desc')
    .orderBy('cl.leg', 'desc')
    .limit(PAGE_SIZE + 1)
    .execute()
  const page = rows.slice(0, PAGE_SIZE)
  const last = page.at(-1)
  return {
    rows: page.map(r => ({
      gameId: r.game_id,
      leg: r.leg,
      finishedAt: r.finished_at,
      opponents: r.opponents,
      context: r.context,
      won: r.won,
      darts: r.darts,
      average: r.average,
      lowVisits: r.low_visits,
      badSetups: r.bad_setups,
      missedDoubles: r.missed_doubles,
      clean: r.clean,
    })),
    next: rows.length > PAGE_SIZE && last ? { finishedAt: last.finished_at, gameId: last.game_id, leg: last.leg } : null,
  }
}

export type CoachLegDetail = {
  review: LegReview
  opponents: string[]
  context: string
  finishedAt: Date
  won: boolean
  winnerName: string | null
  winnerDarts: number | null
}

/** One of the user's own stored legs, or null (another user's leg, none, or a stale one). The leg's winner (coach/store.ts's
 *  build-time lookup in the match detail) comes straight off the row. */
export async function getCoachLeg(db: Kysely<Database>, userId: string, gameId: string, leg: number): Promise<CoachLegDetail | null> {
  const row = await base(db, userId)
    .where('cl.game_id', '=', gameId)
    .where('cl.leg', '=', leg)
    .select(['cl.review', 'cl.opponents', 'cl.context', 'cl.finished_at', 'cl.won', 'cl.winner_name', 'cl.winner_darts'])
    .executeTakeFirst()
  if (!row) return null
  return {
    review: row.review,
    opponents: row.opponents,
    context: row.context,
    finishedAt: row.finished_at,
    won: row.won,
    winnerName: row.winner_name,
    winnerDarts: row.winner_darts,
  }
}
