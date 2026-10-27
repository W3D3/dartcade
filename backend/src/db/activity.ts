import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
import { friendIdsOf } from './friends.js'
import { toAvatar, type Avatar } from './users.js'

const DAY_MS = 86_400_000

/**
 * What a friend's feed can tell about someone (see docs/superpowers/specs/2026-10-27-home-page-design.md):
 * a kind and the payload that kind carries. The same shapes are the HomeEvent schemas in api-v1.yaml;
 * this one checks what the table gives back.
 */
export const ActivityBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one_eighty'), payload: z.object({ count: z.number().int().min(1) }) }),
  z.object({ kind: z.literal('ton_out'), payload: z.object({ count: z.number().int().min(1), best: z.number().int() }) }),
  z.object({ kind: z.literal('rank_up'), payload: z.object({ mode: z.enum(['1v1', '2v2']), rankIndex: z.number().int().min(0) }) }),
])
export type ActivityBody = z.infer<typeof ActivityBody>

export type ActivityInsert = ActivityBody & { userId: string; gameId: string; at: Date }

export type ActivityRow = ActivityBody & { id: string; userId: string; name: string; avatar: Avatar; createdAt: Date }

/** One row per (game, user, kind): writing the same fact again, after a restart say, changes nothing. */
export async function insertActivity(db: Kysely<Database>, rows: ActivityInsert[]): Promise<void> {
  if (rows.length === 0) return
  await db
    .insertInto('friend_activity')
    .values(rows.map(r => ({ user_id: r.userId, game_id: r.gameId, kind: r.kind, payload: JSON.stringify(r.payload), created_at: r.at })))
    .onConflict(oc => oc.columns(['game_id', 'user_id', 'kind']).doNothing())
    .execute()
}

export async function deleteActivityForGame(db: Kysely<Database>, gameId: string): Promise<void> {
  await db.deleteFrom('friend_activity').where('game_id', '=', gameId).execute()
}

/** What the viewer's accepted friends did lately, newest first: the last 7 days, 20 rows by default. */
export async function listFriendActivity(
  db: Kysely<Database>,
  viewerId: string,
  opts: { limit?: number; since?: Date } = {},
): Promise<ActivityRow[]> {
  const friendIds = await friendIdsOf(db, viewerId)
  if (friendIds.length === 0) return []
  const rows = await db
    .selectFrom('friend_activity as a')
    .innerJoin('user as u', 'u.id', 'a.user_id')
    .select([
      'a.id',
      'a.user_id',
      'a.kind',
      'a.payload',
      'a.created_at',
      'u.name',
      'u.avatar_kind',
      'u.avatar_preset',
      'u.avatar_background',
      'u.avatar_version',
    ])
    .where('a.user_id', 'in', friendIds)
    .where('a.created_at', '>=', opts.since ?? new Date(Date.now() - 7 * DAY_MS))
    .orderBy('a.created_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(opts.limit ?? 20)
    .execute()
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    avatar: toAvatar(r),
    createdAt: r.created_at,
    ...ActivityBody.parse({ kind: r.kind, payload: r.payload }),
  }))
}

/** Deletes the rows older than `olderThan`; returns how many. */
export async function pruneActivity(db: Kysely<Database>, olderThan: Date): Promise<number> {
  const res = await db.deleteFrom('friend_activity').where('created_at', '<', olderThan).executeTakeFirst()
  return Number(res.numDeletedRows)
}
