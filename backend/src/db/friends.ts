import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import type { UserSummary } from './queries.js'
import { toAvatar, type Avatar } from './users.js'
import type { LobbyAccess } from '../lobby/types.js'

export type FriendshipRow = {
  id: string
  status: 'pending' | 'accepted'
  requesterId: string
  addresseeId: string
  /** The other side, seen from the user the rows were loaded for. */
  otherId: string
  otherName: string
  /** The other side is Invisible: their friends see them offline. */
  otherInvisible: boolean
  otherAvatar: Avatar
  /** When the other side was last online, if they let their friends see it (show_last_online); null otherwise. */
  otherLastSeenAt: Date | null
  createdAt: Date
  respondedAt: Date | null
}

/** The account with exactly this (normalized) name, any case; flagged names hold nothing. */
export async function findUserByName(db: Kysely<Database>, name: string): Promise<UserSummary | undefined> {
  return db
    .selectFrom('user')
    .select(['id', 'name'])
    .where(sql<boolean>`lower(name) = lower(${name})`)
    .where('name_needs_change', '=', false)
    .executeTakeFirst()
}

export type FriendSearchHit = {
  id: string
  name: string
  avatar: Avatar
  /** How the two stand: `friends`, an open request `sent` by the searcher or `received` from the hit, or `none`. */
  request: 'none' | 'sent' | 'received' | 'friends'
}

/**
 * Who "Add a friend" finds: names containing `term` (names starting with it first) or an email equal
 * to it. Not the searcher or flagged names; someone not discoverable only by their exact name; friends are found too, marked as such. The one place the rules live.
 */
export async function searchUsersForFriends(db: Kysely<Database>, term: string, userId: string, limit: number): Promise<FriendSearchHit[]> {
  const { rows } = await sql<{
    id: string
    name: string
    request: FriendSearchHit['request']
    avatar_kind: 'none' | 'preset' | 'upload'
    avatar_preset: string | null
    avatar_background: string | null
    avatar_version: number
  }>`
    SELECT u.id, u.name, u.avatar_kind, u.avatar_preset, u.avatar_background, u.avatar_version,
      CASE WHEN f.id IS NULL THEN 'none' WHEN f.status = 'accepted' THEN 'friends' WHEN f.requester_id = ${userId} THEN 'sent' ELSE 'received' END AS request
    FROM "user" u
    LEFT JOIN friendships f ON (f.requester_id = ${userId} AND f.addressee_id = u.id) OR (f.addressee_id = ${userId} AND f.requester_id = u.id)
    WHERE u.id <> ${userId}
      AND NOT u.name_needs_change
      AND (u.discoverable OR lower(u.name) = lower(${term}))
      AND (strpos(lower(u.name), lower(${term})) > 0 OR lower(u.email) = lower(${term}))
    ORDER BY starts_with(lower(u.name), lower(${term})) DESC, lower(u.name), u.id
    LIMIT ${limit}`.execute(db)
  return rows.map(r => ({ id: r.id, name: r.name, request: r.request, avatar: toAvatar(r) }))
}

export async function friendshipBetween(db: Kysely<Database>, a: string, b: string) {
  return db
    .selectFrom('friendships')
    .selectAll()
    .where(eb =>
      eb.or([
        eb.and([eb('requester_id', '=', a), eb('addressee_id', '=', b)]),
        eb.and([eb('requester_id', '=', b), eb('addressee_id', '=', a)]),
      ]),
    )
    .executeTakeFirst()
}

export async function getFriendship(db: Kysely<Database>, id: string) {
  return db.selectFrom('friendships').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function insertFriendRequest(
  db: Kysely<Database>,
  r: { id: string; requesterId: string; addresseeId: string },
): Promise<void> {
  await db.insertInto('friendships').values({ id: r.id, requester_id: r.requesterId, addressee_id: r.addresseeId }).execute()
}

/** False when the request is gone or answered already. */
export async function acceptFriendRequest(db: Kysely<Database>, id: string, at: Date): Promise<boolean> {
  const row = await db
    .updateTable('friendships')
    .set({ status: 'accepted', responded_at: at })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .returning('id')
    .executeTakeFirst()
  return row !== undefined
}

export async function deletePendingRequest(db: Kysely<Database>, id: string): Promise<boolean> {
  const row = await db.deleteFrom('friendships').where('id', '=', id).where('status', '=', 'pending').returning('id').executeTakeFirst()
  return row !== undefined
}

export async function deleteFriendshipBetween(db: Kysely<Database>, a: string, b: string): Promise<boolean> {
  const row = await db
    .deleteFrom('friendships')
    .where('status', '=', 'accepted')
    .where(eb =>
      eb.or([
        eb.and([eb('requester_id', '=', a), eb('addressee_id', '=', b)]),
        eb.and([eb('requester_id', '=', b), eb('addressee_id', '=', a)]),
      ]),
    )
    .returning('id')
    .executeTakeFirst()
  return row !== undefined
}

/** Every request and friendship the user is part of, the other side's name with it, by name. */
export async function friendshipsOf(db: Kysely<Database>, userId: string): Promise<FriendshipRow[]> {
  const { rows } = await sql<{
    id: string
    status: string
    requester_id: string
    addressee_id: string
    other_id: string
    other_name: string
    other_invisible: boolean
    other_last_seen_at: Date | null
    other_avatar_kind: 'none' | 'preset' | 'upload'
    other_avatar_preset: string | null
    other_avatar_background: string | null
    other_avatar_version: number
    created_at: Date
    responded_at: Date | null
  }>`
    SELECT f.id, f.status, f.requester_id, f.addressee_id, u.id AS other_id, u.name AS other_name, u.invisible AS other_invisible,
      CASE WHEN u.show_last_online = 'friends' THEN u.last_seen_at END AS other_last_seen_at,
      u.avatar_kind AS other_avatar_kind, u.avatar_preset AS other_avatar_preset, u.avatar_background AS other_avatar_background,
      u.avatar_version AS other_avatar_version, f.created_at, f.responded_at
    FROM friendships f
    JOIN "user" u ON u.id = CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END
    WHERE f.requester_id = ${userId} OR f.addressee_id = ${userId}
    ORDER BY lower(u.name), u.id`.execute(db)
  return rows.map(r => ({
    id: r.id,
    status: r.status === 'accepted' ? 'accepted' : 'pending',
    requesterId: r.requester_id,
    addresseeId: r.addressee_id,
    otherId: r.other_id,
    otherName: r.other_name,
    otherInvisible: r.other_invisible,
    otherLastSeenAt: r.other_last_seen_at,
    otherAvatar: toAvatar({
      avatar_kind: r.other_avatar_kind,
      avatar_preset: r.other_avatar_preset,
      avatar_background: r.other_avatar_background,
      avatar_version: r.other_avatar_version,
    }),
    createdAt: r.created_at,
    respondedAt: r.responded_at,
  }))
}

/** For each of `otherIds`, how many friends they share with the user. */
export async function mutualFriendCounts(db: Kysely<Database>, userId: string, otherIds: string[]): Promise<Map<string, number>> {
  if (otherIds.length === 0) return new Map()
  const { rows } = await sql<{ other: string; n: string }>`
    WITH edges AS (
      SELECT requester_id AS a, addressee_id AS b FROM friendships WHERE status = 'accepted'
      UNION ALL
      SELECT addressee_id AS a, requester_id AS b FROM friendships WHERE status = 'accepted'
    )
    SELECT o.a AS other, count(*) AS n
    FROM edges o JOIN edges mine ON mine.b = o.b AND mine.a = ${userId}
    WHERE o.a = ANY(${otherIds}::text[])
    GROUP BY o.a`.execute(db)
  return new Map(rows.map(r => [r.other, Number(r.n)]))
}

export async function areFriends(db: Kysely<Database>, a: string, b: string): Promise<boolean> {
  return (await friendshipBetween(db, a, b))?.status === 'accepted'
}

/** The user's accepted friends. */
export async function friendIdsOf(db: Kysely<Database>, userId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('friendships')
    .select(['requester_id', 'addressee_id'])
    .where('status', '=', 'accepted')
    .where(eb => eb.or([eb('requester_id', '=', userId), eb('addressee_id', '=', userId)]))
    .execute()
  return rows.map(r => (r.requester_id === userId ? r.addressee_id : r.requester_id))
}

/** An open lobby someone is in, as their friends' status shows it. */
export type LobbyOfUser = { id: string; name: string; access: LobbyAccess; hostUserId: string | null }

export async function openLobbiesOf(db: Kysely<Database>, userIds: string[]): Promise<Map<string, LobbyOfUser>> {
  const out = new Map<string, LobbyOfUser>()
  if (userIds.length === 0) return out
  const rows = await db
    .selectFrom('lobby_people as p')
    .innerJoin('lobbies as l', 'l.id', 'p.lobby_id')
    .select(['p.user_id', 'l.id', 'l.name', 'l.access', 'l.host_user_id'])
    .where('p.user_id', 'in', userIds)
    .where('l.closed_at', 'is', null)
    .execute()
  for (const r of rows) {
    if (r.user_id === null) continue
    out.set(r.user_id, { id: r.id, name: r.name, access: r.access === 'invite' ? 'invite' : 'friends', hostUserId: r.host_user_id })
  }
  return out
}

/** Who has a pending invite to the lobby. */
export async function pendingInviteesOf(db: Kysely<Database>, lobbyId: string): Promise<Set<string>> {
  const rows = await db
    .selectFrom('lobby_invites')
    .select('invitee_user_id')
    .where('lobby_id', '=', lobbyId)
    .where('status', '=', 'pending')
    .execute()
  return new Set(rows.map(r => r.invitee_user_id))
}

/** At most this often per user: a reconnecting browser is not a write each time. */
const LAST_SEEN_EVERY = '5 minutes'

/** The user's last socket closed: remember it (migration 050), unless it was remembered a moment ago. */
export async function touchLastSeen(db: Kysely<Database>, userId: string, at: Date): Promise<void> {
  await sql`UPDATE "user" SET last_seen_at = ${at}
    WHERE id = ${userId} AND (last_seen_at IS NULL OR last_seen_at < ${at}::timestamptz - ${LAST_SEEN_EVERY}::interval)`.execute(db)
}

/** The server stops with these users online: remember it for them all at once, throttle or not. */
export async function setLastSeen(db: Kysely<Database>, userIds: string[], at: Date): Promise<void> {
  if (userIds.length > 0) await db.updateTable('user').set({ last_seen_at: at }).where('id', 'in', userIds).execute()
}

/** What a profile's Friends section needs to know about its owner. */
export async function privacyOf(db: Kysely<Database>, userId: string) {
  const row = await db
    .selectFrom('user')
    .select(['invisible', 'show_last_online', 'friends_visibility', 'last_seen_at'])
    .where('id', '=', userId)
    .executeTakeFirst()
  return (
    row && {
      invisible: row.invisible,
      showLastOnline: row.show_last_online,
      friendsVisibility: row.friends_visibility,
      lastSeenAt: row.last_seen_at,
    }
  )
}
