// What a player's profile (popup and page) shows about them, from the viewer's side.
import { sql, type Kysely, type NotNull } from 'kysely'
import type { Database } from './schema.js'
import { toAvatar, type Avatar } from './users.js'
import { activeBan, type PublicBan } from '../shared/bans.js'

/** Name, joined, their picture, the stored look (user.preferences.equipped) and the ban in force (never its note). */
export async function profileUser(
  db: Kysely<Database>,
  userId: string,
): Promise<
  | {
      id: string
      name: string
      createdAt: Date
      avatar: Avatar
      equipped: Record<string, unknown> | null
      country: string | null
      ban: PublicBan | null
    }
  | undefined
> {
  const row = await db
    .selectFrom('user')
    .select([
      'id',
      'name',
      'createdAt',
      'avatar_kind',
      'avatar_preset',
      'avatar_background',
      'avatar_version',
      'banned',
      'banReason',
      'banExpires',
      'country',
      sql<Record<string, unknown> | null>`preferences->'equipped'`.as('equipped'),
    ])
    .where('id', '=', userId)
    .executeTakeFirst()
  return (
    row && {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      avatar: toAvatar(row),
      equipped: row.equipped,
      country: row.country,
      ban: activeBan(row),
    }
  )
}

const counted = (db: Kysely<Database>) =>
  db
    .selectFrom('game_players as gp')
    .innerJoin('game_sessions as gs', 'gs.id', 'gp.session_id')
    .where('gs.status', '=', 'finished')
    .where('gs.invalidated_at', 'is', null)
    .where('gp.placement', 'is not', null)

/** Finished games per mode, most played first. */
export async function modeCounts(db: Kysely<Database>, userId: string): Promise<{ mode: string; games: number }[]> {
  const rows = await counted(db)
    .select(['gs.game_id', sql<number>`count(*)::int`.as('games')])
    .where('gp.user_id', '=', userId)
    .groupBy('gs.game_id')
    .orderBy('games', 'desc')
    .orderBy('gs.game_id')
    .execute()
  return rows.map(r => ({ mode: r.game_id, games: r.games }))
}

/** `viewer`'s record against `other`: games both played, won by whoever placed higher. */
export async function headToHead(db: Kysely<Database>, viewer: string, other: string): Promise<{ wins: number; losses: number }> {
  const row = await counted(db)
    .innerJoin('game_players as them', join => join.onRef('them.session_id', '=', 'gs.id').on('them.user_id', '=', other))
    .select([
      sql<number>`count(*) FILTER (WHERE gp.placement < them.placement)::int`.as('wins'),
      sql<number>`count(*) FILTER (WHERE gp.placement > them.placement)::int`.as('losses'),
    ])
    .where('gp.user_id', '=', viewer)
    .where('them.placement', 'is not', null)
    .executeTakeFirstOrThrow()
  return row
}

export type RecentGame = { id: string; gameId: string; finishedAt: Date; placement: number; players: number; others: string[] }

/**
 * The player's last finished games: all of them for themselves; for anyone else the public ones
 * and the ones the viewer played in too.
 */
export async function recentGames(db: Kysely<Database>, userId: string, viewer: string, limit = 5): Promise<RecentGame[]> {
  const rows = await counted(db)
    .select([
      'gs.id',
      'gs.game_id',
      'gs.finished_at',
      'gp.placement',
      sql<number>`(SELECT count(*)::int FROM game_players p WHERE p.session_id = gs.id)`.as('players'),
      sql<string[]>`ARRAY(SELECT p.name FROM game_players p WHERE p.session_id = gs.id AND p.seat <> gp.seat ORDER BY p.seat)`.as('others'),
    ])
    .where('gp.user_id', '=', userId)
    .$if(userId !== viewer, q =>
      q.where(eb =>
        eb.or([
          eb('gs.visibility', '=', 'public'),
          eb.exists(
            eb.selectFrom('game_players as v').select('v.seat').whereRef('v.session_id', '=', 'gs.id').where('v.user_id', '=', viewer),
          ),
        ]),
      ),
    )
    .$narrowType<{ finished_at: NotNull; placement: NotNull }>()
    .orderBy('gs.finished_at', 'desc')
    .limit(limit)
    .execute()
  return rows.map(r => ({
    id: r.id,
    gameId: r.game_id,
    finishedAt: r.finished_at,
    placement: r.placement,
    players: r.players,
    others: r.others,
  }))
}
