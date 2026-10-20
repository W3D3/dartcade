import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
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
export type AdminGame = {
  id: string
  game_id: string
  status: AdminGameStatus
  config: Record<string, unknown>
  created_at: Date
  finished_at: Date | null
  board: { id: string; name: string } | null
  ranked: boolean
  seats: AdminGameSeat[]
}

export type AdminGameFilter = {
  status: AdminGameStatus | 'all'
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
    .select([
      'gs.id',
      'gs.game_id',
      'gs.status',
      'gs.config',
      'gs.created_at',
      'gs.finished_at',
      'b.id as board_id',
      'b.name as board_name',
      sql<boolean>`EXISTS (SELECT 1 FROM ranked_results rr WHERE rr.session_id = gs.id)`.as('ranked'),
    ])
    .orderBy('gs.created_at', 'desc')
    .orderBy('gs.id', 'desc')
    .limit(opts.limit + 1)
  if (filter.status !== 'all') q = q.where('gs.status', '=', filter.status)
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
      seats: (seats.get(r.id) ?? []).map(({ session_id: _s, ...seat }) => seat),
    })),
    next: rows.length > opts.limit && last ? { finishedAt: last.created_at, id: last.id } : null,
  }
}
