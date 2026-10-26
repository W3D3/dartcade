import { sql, type Kysely, type NotNull } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
import type { Cursor } from '../history/cursor.js'
import type { StatRow } from '../history/stats.js'
import { groupBy } from '../util/groupBy.js'
import { toAvatar, type Avatar } from './users.js'

export type HistorySeat = {
  seat: number
  name: string
  user_id: string | null
  /** The account's profile picture; none for a guest or bot. */
  avatar: Avatar
  /** The bot's difficulty; null for a member or guest. */
  bot_level: number | null
  placement: number
  throw_position: number | null
  stats: Record<string, number>
  forfeited: boolean
}
export type HistoryGame = {
  id: string
  game_id: string
  config: Record<string, unknown>
  rng_seed: number
  game_version: number
  created_at: Date
  finished_at: Date
  board: { id: string; name: string } | null
  /** The viewer's seat; null when they don't hold one (a public game). */
  mySeat: number | null
  /** A moderator invalidated it: it stays in the players' history but no longer counts. */
  invalidated: boolean
  seats: HistorySeat[]
}

// JSONB written by this backend; read defensively
const StatsSchema = z.record(z.string(), z.number()).catch({})
const ConfigSchema = z.record(z.string(), z.unknown()).catch({})

/** Placed seats (finished games only have those) of these games, in seat order. */
async function placedSeats(db: Kysely<Database>, ids: string[]): Promise<Map<string, HistorySeat[]>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .selectFrom('game_players as gp')
    .leftJoin('user as u', 'u.id', 'gp.user_id')
    .select([
      'gp.session_id',
      'gp.seat',
      'gp.name',
      'gp.user_id',
      'gp.bot_level',
      'gp.placement',
      'gp.throw_position',
      'gp.stats',
      'gp.forfeited',
      'u.avatar_kind',
      'u.avatar_preset',
      'u.avatar_background',
      'u.avatar_version',
    ])
    .where('gp.session_id', 'in', ids)
    .where('gp.placement', 'is not', null)
    .$narrowType<{ placement: NotNull }>()
    .orderBy('gp.session_id')
    .orderBy('gp.seat')
    .execute()
  const by = new Map<string, HistorySeat[]>()
  for (const [sessionId, seats] of groupBy(rows, r => r.session_id)) {
    by.set(
      sessionId,
      seats.map(r => ({
        seat: r.seat,
        name: r.name,
        user_id: r.user_id,
        // Guests and bots have no account row to join
        avatar:
          r.avatar_kind === null
            ? { kind: 'none' }
            : toAvatar({
                avatar_kind: r.avatar_kind,
                avatar_preset: r.avatar_preset,
                avatar_background: r.avatar_background,
                avatar_version: r.avatar_version ?? 0,
              }),
        bot_level: r.bot_level,
        placement: r.placement,
        throw_position: r.throw_position,
        stats: StatsSchema.parse(r.stats),
        forfeited: r.forfeited,
      })),
    )
  }
  return by
}

/** Finished games with a result; the ones a moderator invalidated are left out unless asked for (stats and ratings never ask). */
function finishedGames(db: Kysely<Database>, includeInvalidated = false) {
  return db
    .selectFrom('game_sessions as gs')
    .leftJoin('boards as b', 'b.id', 'gs.board_db_id')
    .select([
      'gs.id',
      'gs.game_id',
      'gs.config',
      'gs.rng_seed',
      'gs.game_version',
      'gs.created_at',
      'gs.finished_at',
      'gs.visibility',
      'gs.invalidated_at',
      'b.id as board_id',
      'b.name as board_name',
    ])
    .where('gs.status', '=', 'finished')
    .where('gs.finished_at', 'is not', null)
    .$if(!includeInvalidated, q => q.where('gs.invalidated_at', 'is', null))
    .$narrowType<{ finished_at: NotNull }>()
}

type GameRow = {
  id: string
  game_id: string
  config: unknown
  rng_seed: number
  game_version: number
  created_at: Date
  finished_at: Date
  invalidated_at: Date | null
  board_id: string | null
  board_name: string | null
}

function toGame(r: GameRow, seats: HistorySeat[], mySeat: number | null): HistoryGame {
  return {
    id: r.id,
    game_id: r.game_id,
    config: ConfigSchema.parse(r.config),
    rng_seed: r.rng_seed,
    game_version: r.game_version,
    created_at: r.created_at,
    finished_at: r.finished_at,
    board: r.board_id !== null && r.board_name !== null ? { id: r.board_id, name: r.board_name } : null,
    mySeat,
    invalidated: r.invalidated_at !== null,
    seats,
  }
}

/** The user's finished, placed games, newest first, one page after `after`; invalidated ones are in it, marked. */
export async function listFinishedGames(
  db: Kysely<Database>,
  userId: string,
  opts: { mode?: string; limit: number; after: Cursor | null },
): Promise<{ games: HistoryGame[]; next: Cursor | null }> {
  let q = finishedGames(db, true)
    .innerJoin('game_players as me', 'me.session_id', 'gs.id')
    .select('me.seat as my_seat')
    .where('me.user_id', '=', userId)
    .where('me.placement', 'is not', null)
    .orderBy('gs.finished_at', 'desc')
    .orderBy('gs.id', 'desc')
    .limit(opts.limit + 1)
  if (opts.mode) q = q.where('gs.game_id', '=', opts.mode)
  const after = opts.after
  if (after) {
    q = q.where(eb =>
      eb.or([
        eb('gs.finished_at', '<', after.finishedAt),
        eb.and([eb('gs.finished_at', '=', after.finishedAt), eb('gs.id', '<', after.id)]),
      ]),
    )
  }
  const rows = await q.execute()
  const page = rows.slice(0, opts.limit)
  const seats = await placedSeats(
    db,
    page.map(r => r.id),
  )
  const last = page.at(-1)
  return {
    games: page.map(r => toGame(r, seats.get(r.id) ?? [], r.my_seat)),
    next: rows.length > opts.limit && last ? { finishedAt: last.finished_at, id: last.id } : null,
  }
}

/** The user's seat in each finished, placed game since `since`. */
export async function getStatRows(db: Kysely<Database>, userId: string, since: Date): Promise<StatRow[]> {
  const rows = await finishedGames(db)
    .innerJoin('game_players as me', 'me.session_id', 'gs.id')
    .select(['me.placement', 'me.stats', sql<number>`(SELECT count(*)::int FROM game_players p WHERE p.session_id = gs.id)`.as('seats')])
    .where('me.user_id', '=', userId)
    .where('me.placement', 'is not', null)
    .$narrowType<{ placement: NotNull }>()
    .where('gs.finished_at', '>=', since)
    .execute()
  return rows.map(r => ({
    mode: r.game_id,
    finishedAt: r.finished_at,
    placement: r.placement,
    seats: r.seats,
    stats: StatsSchema.parse(r.stats),
  }))
}

/** The highest value of stat `key` in the user's finished games of `mode`, and when that game finished; null when none has it. */
export async function getBestStat(
  db: Kysely<Database>,
  userId: string,
  mode: string,
  key: string,
): Promise<{ value: number; finishedAt: Date } | null> {
  const value = sql<number>`(me.stats->>${key})::float8`
  const row = await finishedGames(db)
    .innerJoin('game_players as me', 'me.session_id', 'gs.id')
    .select(value.as('value'))
    .where('me.user_id', '=', userId)
    .where('me.placement', 'is not', null)
    .where('gs.game_id', '=', mode)
    .where(sql<boolean>`me.stats ? ${key}`)
    .orderBy(value, 'desc')
    .orderBy('gs.finished_at', 'asc')
    .limit(1)
    .executeTakeFirst()
  return row ? { value: row.value, finishedAt: row.finished_at } : null
}

/** A finished game the user may see: they hold a seat, or it is public. An invalidated one is still shown, marked as such. */
export async function getViewableGame(db: Kysely<Database>, id: string, userId: string): Promise<HistoryGame | undefined> {
  const row = await finishedGames(db, true)
    .leftJoin('game_players as me', join => join.onRef('me.session_id', '=', 'gs.id').on('me.user_id', '=', userId))
    .select('me.seat as my_seat')
    .where('gs.id', '=', id)
    .executeTakeFirst()
  if (!row) return undefined
  if (row.my_seat === null && row.visibility !== 'public') return undefined
  const seats = (await placedSeats(db, [id])).get(id) ?? []
  // Finished before game history existed: no result, nothing to show
  if (seats.length === 0) return undefined
  return toGame(row, seats, row.my_seat)
}

/** Any finished game with a result, whoever played it and invalidated or not (admins and moderators). `mySeat` is null. */
export async function getFinishedGame(db: Kysely<Database>, id: string): Promise<HistoryGame | undefined> {
  const row = await finishedGames(db, true).where('gs.id', '=', id).executeTakeFirst()
  if (!row) return undefined
  const seats = (await placedSeats(db, [id])).get(id) ?? []
  if (seats.length === 0) return undefined
  return toGame(row, seats, null)
}

/** A finished game's stored detail and match stats, and the version that built them. */
export async function getGameDetail(db: Kysely<Database>, id: string) {
  return db.selectFrom('game_details').select(['version', 'detail', 'stats']).where('session_id', '=', id).executeTakeFirst()
}

/** Stores a finished game's detail and match stats, over any built by another version. */
export async function saveGameDetail(
  db: Kysely<Database>,
  id: string,
  version: string,
  built: { detail: unknown; stats: unknown },
): Promise<void> {
  const values = { version, detail: JSON.stringify(built.detail), stats: JSON.stringify(built.stats) }
  await db
    .insertInto('game_details')
    .values({ session_id: id, ...values })
    .onConflict(oc => oc.column('session_id').doUpdateSet(values))
    .execute()
}
