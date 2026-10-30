import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import { deleteActivityForGame } from './activity.js'
import { recalculateRatings } from './ranked.js'
import { revokeGameXp } from './progression.js'
import type { Database } from './schema.js'
import { RANKED_MODES, type RankedMode } from '../shared/ranked.js'
import type { Cursor } from '../history/cursor.js'
import { groupBy } from '../util/groupBy.js'

export type AdminGameStatus = 'finished' | 'aborted' | 'active'

export type AdminGameSeat = {
  seat: number
  name: string
  user_id: string | null
  bot_level: number | null
  placement: number | null
  forfeited: boolean
}
/** A moderator took the game out of history, stats and ratings. */
export type Invalidation = { at: Date; by: { id: string; name: string } | null; reason: string | null }

export type AdminGame = {
  id: string
  game_id: string
  status: AdminGameStatus
  config: Record<string, unknown>
  created_at: Date
  finished_at: Date | null
  board: { id: string; name: string } | null
  ranked: boolean
  invalidated: Invalidation | null
  seats: AdminGameSeat[]
}

export type AdminGameFilter = {
  /** 'invalidated': finished games a moderator invalidated. */
  status: AdminGameStatus | 'invalidated' | 'all'
  mode?: string
  /** A seat's name contains this, or its account id is this. */
  player?: string
  board?: string
  ranked?: boolean
  from?: Date
  to?: Date
}

// JSONB written by this backend; read defensively
const ConfigSchema = z.record(z.string(), z.unknown()).catch({})

function toInvalidation(r: {
  invalidated_at: Date | null
  invalidated_by: string | null
  invalidator: string | null
  invalidation_reason: string | null
}): Invalidation | null {
  if (r.invalidated_at === null) return null
  return {
    at: r.invalidated_at,
    by: r.invalidated_by !== null && r.invalidator !== null ? { id: r.invalidated_by, name: r.invalidator } : null,
    reason: r.invalidation_reason,
  }
}

function asStatus(s: string): AdminGameStatus {
  return s === 'finished' || s === 'aborted' ? s : 'active'
}

/** A literal for ILIKE: `%`, `_` and `\` mean themselves. */
function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}

/** Games of anyone matching the filter, newest started first, one page after `after` (keyset on created_at, id). */
export async function listAllGames(
  db: Kysely<Database>,
  filter: AdminGameFilter,
  opts: { limit: number; after: Cursor | null },
): Promise<{ games: AdminGame[]; next: Cursor | null }> {
  let q = db
    .selectFrom('game_sessions as gs')
    .leftJoin('boards as b', 'b.id', 'gs.board_db_id')
    .leftJoin('user as iu', 'iu.id', 'gs.invalidated_by')
    .select([
      'gs.id',
      'gs.game_id',
      'gs.status',
      'gs.config',
      'gs.created_at',
      'gs.finished_at',
      'gs.invalidated_at',
      'gs.invalidated_by',
      'gs.invalidation_reason',
      'iu.name as invalidator',
      'b.id as board_id',
      'b.name as board_name',
      sql<boolean>`EXISTS (SELECT 1 FROM ranked_results rr WHERE rr.session_id = gs.id)`.as('ranked'),
    ])
    .orderBy('gs.created_at', 'desc')
    .orderBy('gs.id', 'desc')
    .limit(opts.limit + 1)
  if (filter.status === 'invalidated') q = q.where('gs.invalidated_at', 'is not', null)
  else if (filter.status !== 'all') q = q.where('gs.status', '=', filter.status)
  if (filter.mode) q = q.where('gs.game_id', '=', filter.mode)
  if (filter.board) q = q.where('gs.board_db_id', '=', filter.board)
  if (filter.from) q = q.where('gs.created_at', '>=', filter.from)
  if (filter.to) q = q.where('gs.created_at', '<', filter.to)
  if (filter.ranked) q = q.where(sql<boolean>`EXISTS (SELECT 1 FROM ranked_results rr WHERE rr.session_id = gs.id)`)
  const player = filter.player
  if (player) {
    q = q.where(
      sql<boolean>`EXISTS (SELECT 1 FROM game_players p WHERE p.session_id = gs.id AND (p.user_id = ${player} OR p.name ILIKE ${`%${likeLiteral(player)}%`}))`,
    )
  }
  const after = opts.after
  if (after) {
    q = q.where(eb =>
      eb.or([eb('gs.created_at', '<', after.finishedAt), eb.and([eb('gs.created_at', '=', after.finishedAt), eb('gs.id', '<', after.id)])]),
    )
  }
  const rows = await q.execute()
  const page = rows.slice(0, opts.limit)
  const seatRows =
    page.length === 0
      ? []
      : await db
          .selectFrom('game_players')
          .select(['session_id', 'seat', 'name', 'user_id', 'bot_level', 'placement', 'forfeited'])
          .where(
            'session_id',
            'in',
            page.map(r => r.id),
          )
          .orderBy('session_id')
          .orderBy('seat')
          .execute()
  const seats = groupBy(seatRows, r => r.session_id)
  const last = page.at(-1)
  return {
    games: page.map(r => ({
      id: r.id,
      game_id: r.game_id,
      status: asStatus(r.status),
      config: ConfigSchema.parse(r.config),
      created_at: r.created_at,
      finished_at: r.finished_at,
      board: r.board_id !== null && r.board_name !== null ? { id: r.board_id, name: r.board_name } : null,
      ranked: r.ranked,
      invalidated: toInvalidation(r),
      seats: (seats.get(r.id) ?? []).map(({ session_id: _s, ...seat }) => seat),
    })),
    next: rows.length > opts.limit && last ? { finishedAt: last.created_at, id: last.id } : null,
  }
}

/** How a game was invalidated, or null when it was not (or does not exist). */
export async function getInvalidation(db: Kysely<Database>, id: string): Promise<Invalidation | null> {
  const row = await db
    .selectFrom('game_sessions as gs')
    .leftJoin('user as iu', 'iu.id', 'gs.invalidated_by')
    .select(['gs.invalidated_at', 'gs.invalidated_by', 'gs.invalidation_reason', 'iu.name as invalidator'])
    .where('gs.id', '=', id)
    .executeTakeFirst()
  return row ? toInvalidation(row) : null
}

/**
 * Invalidates a finished game: it stays, but no longer counts in history, stats or best values, and
 * the ranked ratings of every mode it was rated in are replayed without it (recalculateRatings).
 * The reason is optional. One transaction, with an audit row.
 */
export async function invalidateGame(
  db: Kysely<Database>,
  id: string,
  moderatorUserId: string,
  reason: string | null,
): Promise<'not-found' | 'not-finished' | 'already-invalidated' | { recalculated: RankedMode[] }> {
  return db.transaction().execute(async trx => {
    const game = await trx
      .selectFrom('game_sessions')
      .select(['id', 'game_id', 'status', 'owner_user_id', 'invalidated_at'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst()
    if (!game) return 'not-found'
    if (game.status !== 'finished') return 'not-finished'
    if (game.invalidated_at !== null) return 'already-invalidated'
    const players = await trx
      .selectFrom('game_players')
      .select(['seat', 'name', 'user_id'])
      .where('session_id', '=', id)
      .orderBy('seat')
      .execute()
    const rated = await trx.selectFrom('ranked_results').select('mode').distinct().where('session_id', '=', id).execute()
    const modes = RANKED_MODES.filter(m => rated.some(r => r.mode === m))
    await trx
      .updateTable('game_sessions')
      .set({ invalidated_at: new Date(), invalidated_by: moderatorUserId, invalidation_reason: reason })
      .where('id', '=', id)
      .execute()
    await revokeGameXp(trx, id)
    // Events are cheap, not a record: restoring the game does not write them again, and the ratings
    // replayed below do not rewrite the rank_up events of later games (a week of feed at most)
    await deleteActivityForGame(trx, id)
    for (const mode of modes) await recalculateRatings(trx, mode)
    await trx
      .insertInto('admin_audit')
      .values({
        admin_user_id: moderatorUserId,
        action: 'game.invalidate',
        target: id,
        detail: JSON.stringify({ mode: game.game_id, ownerUserId: game.owner_user_id, players, reason, recalculated: modes }),
      })
      .execute()
    return { recalculated: modes }
  })
}

/**
 * Takes the invalidation back: the game counts in history, stats and ratings again, and the ranked
 * ratings of every mode it was rated in are replayed with it (it slots back in where it was played).
 * One transaction, with an audit row.
 */
export async function restoreGame(
  db: Kysely<Database>,
  id: string,
  moderatorUserId: string,
): Promise<'not-found' | 'not-invalidated' | { recalculated: RankedMode[] }> {
  return db.transaction().execute(async trx => {
    const game = await trx
      .selectFrom('game_sessions')
      .select(['id', 'game_id', 'owner_user_id', 'invalidated_at', 'invalidated_by', 'invalidation_reason'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst()
    if (!game) return 'not-found'
    if (game.invalidated_at === null) return 'not-invalidated'
    const players = await trx
      .selectFrom('game_players')
      .select(['seat', 'name', 'user_id'])
      .where('session_id', '=', id)
      .orderBy('seat')
      .execute()
    const rated = await trx.selectFrom('ranked_results').select('mode').distinct().where('session_id', '=', id).execute()
    const modes = RANKED_MODES.filter(m => rated.some(r => r.mode === m))
    await trx
      .updateTable('game_sessions')
      .set({ invalidated_at: null, invalidated_by: null, invalidation_reason: null })
      .where('id', '=', id)
      .execute()
    for (const mode of modes) await recalculateRatings(trx, mode)
    await trx
      .insertInto('admin_audit')
      .values({
        admin_user_id: moderatorUserId,
        action: 'game.restore',
        target: id,
        detail: JSON.stringify({
          mode: game.game_id,
          ownerUserId: game.owner_user_id,
          players,
          recalculated: modes,
          wasInvalidatedBy: game.invalidated_by,
          wasInvalidatedFor: game.invalidation_reason,
        }),
      })
      .execute()
    return { recalculated: modes }
  })
}

/**
 * Deletes a finished or aborted game for good, invalidated or not (admins only; moderators
 * invalidate): its seats, darts and input log go with it (cascade), so history, stats and best
 * values follow. Ranked ratings of every mode it was rated in are replayed without it
 * (recalculateRatings). A game in progress is refused. One transaction, with an audit row.
 */
export async function deleteGame(
  db: Kysely<Database>,
  id: string,
  adminUserId: string,
): Promise<'not-found' | 'active' | { recalculated: RankedMode[] }> {
  return db.transaction().execute(async trx => {
    const game = await trx
      .selectFrom('game_sessions')
      .select(['id', 'game_id', 'status', 'owner_user_id', 'invalidated_at', 'invalidation_reason'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst()
    if (!game) return 'not-found'
    if (game.status === 'active') return 'active'
    const players = await trx
      .selectFrom('game_players')
      .select(['seat', 'name', 'user_id'])
      .where('session_id', '=', id)
      .orderBy('seat')
      .execute()
    const rated = await trx.selectFrom('ranked_results').select('mode').distinct().where('session_id', '=', id).execute()
    const modes = RANKED_MODES.filter(m => rated.some(r => r.mode === m))
    await trx.deleteFrom('game_sessions').where('id', '=', id).execute()
    await revokeGameXp(trx, id)
    for (const mode of modes) await recalculateRatings(trx, mode)
    await trx
      .insertInto('admin_audit')
      .values({
        admin_user_id: adminUserId,
        action: 'game.delete',
        target: id,
        detail: JSON.stringify({
          mode: game.game_id,
          status: game.status,
          ownerUserId: game.owner_user_id,
          players,
          wasInvalidated: game.invalidated_at !== null,
          wasInvalidatedFor: game.invalidation_reason,
          recalculated: modes,
        }),
      })
      .execute()
    return { recalculated: modes }
  })
}
