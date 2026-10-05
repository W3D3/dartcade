import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import type { UserSummary } from './queries.js'
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
    created_at: Date
    responded_at: Date | null
  }>`
    SELECT f.id, f.status, f.requester_id, f.addressee_id, u.id AS other_id, u.name AS other_name, u.invisible AS other_invisible, f.created_at, f.responded_at
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
