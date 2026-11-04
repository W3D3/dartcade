// Admin-only user listing and role changes (schema/api-v1.yaml, tag admin; api/adminUsers.ts).
import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { toAvatar, type Avatar } from './users.js'
import { counts } from './ranked.js'
import { getProgress } from './progression.js'
import { activeBan, type BanCategory, type PublicBan } from '../shared/bans.js'

export type AdminUserRow = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: 'admin' | 'moderator' | null
  createdAt: Date
  lastLoginAt: Date | null
  avatar: Avatar
  /** The ban in force, with the admin-only note from its audit row */
  ban: (PublicBan & { note: string | null }) | null
}

const COLUMNS = [
  'id',
  'name',
  'email',
  'emailVerified',
  'role',
  'createdAt',
  'last_login_at',
  'avatar_kind',
  'avatar_preset',
  'avatar_background',
  'avatar_version',
  'banned',
  'banReason',
  'banExpires',
  // The note is kept only in the ban's admin_audit row, never on `user`: better-auth's own endpoints can't send it
  sql<
    string | null
  >`(SELECT detail->>'note' FROM admin_audit WHERE action = 'user.ban' AND target = "user".id ORDER BY id DESC LIMIT 1)`.as('ban_note'),
] as const

const toRow = (r: {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string | null
  createdAt: Date
  last_login_at: Date | null
  avatar_kind: 'none' | 'preset' | 'upload'
  avatar_preset: string | null
  avatar_background: string | null
  avatar_version: number
  banned: boolean | null
  banReason: string | null
  banExpires: Date | null
  ban_note: string | null
}): AdminUserRow => {
  const ban = activeBan(r)
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    emailVerified: r.emailVerified,
    role: r.role === 'admin' || r.role === 'moderator' ? r.role : null,
    createdAt: r.createdAt,
    lastLoginAt: r.last_login_at,
    avatar: toAvatar(r),
    ban: ban && { ...ban, note: r.ban_note },
  }
}

/** Every user, newest first, at most 200; `q`, if given, matches name or email (case-insensitive, contains). */
export async function listUsers(db: Kysely<Database>, q?: string): Promise<AdminUserRow[]> {
  let query = db.selectFrom('user').select(COLUMNS).orderBy('createdAt', 'desc').limit(200)
  if (q) {
    // shortcut: % and _ in q aren't escaped for LIKE; an admin search box, a wrong match here is low-risk
    const pattern = `%${q}%`
    query = query.where(eb => eb.or([eb('name', 'ilike', pattern), eb('email', 'ilike', pattern)]))
  }
  return (await query.execute()).map(toRow)
}

/** One user, for the response after a role change. */
export async function getUser(db: Kysely<Database>, id: string): Promise<AdminUserRow | undefined> {
  const row = await db.selectFrom('user').select(COLUMNS).where('id', '=', id).executeTakeFirst()
  return row && toRow(row)
}

/** Sets emailVerified. */
export async function setVerified(db: Kysely<Database>, id: string, verified: boolean): Promise<'ok' | 'not-found'> {
  const result = await db.updateTable('user').set({ emailVerified: verified }).where('id', '=', id).executeTakeFirst()
  return result.numUpdatedRows > 0n ? 'ok' : 'not-found'
}

/**
 * Sets a user's role: admin, moderator, or none. Locks every admin row first (`FOR UPDATE`), so two
 * concurrent demotions serialize: the second one re-counts admins against the first one's committed
 * result, and refuses rather than leaving no admin.
 */
export async function setRole(
  db: Kysely<Database>,
  id: string,
  role: 'admin' | 'moderator' | null,
): Promise<'ok' | 'not-found' | 'last-admin'> {
  return db.transaction().execute(async trx => {
    const admins = await trx.selectFrom('user').select('id').where('role', '=', 'admin').forUpdate().execute()
    const user = await trx.selectFrom('user').select(['id', 'role']).where('id', '=', id).executeTakeFirst()
    if (!user) return 'not-found'
    if (role !== 'admin' && user.role === 'admin' && admins.length <= 1) return 'last-admin'
    await trx.updateTable('user').set({ role }).where('id', '=', id).execute()
    return 'ok'
  })
}

/**
 * Bans a user until `until` (null: for good): signs them out everywhere and records it in
 * admin_audit, note included. Admins can't be banned, nor can you ban yourself. Banning someone
 * already banned replaces their ban. The live effects (sockets, lobby, games) are the caller's.
 */
export async function banUser(
  db: Kysely<Database>,
  adminUserId: string,
  id: string,
  ban: { category: BanCategory; note: string | null; until: Date | null },
): Promise<'ok' | 'not-found' | 'self' | 'admin'> {
  if (id === adminUserId) return 'self'
  return db.transaction().execute(async trx => {
    const user = await trx.selectFrom('user').select('role').where('id', '=', id).forUpdate().executeTakeFirst()
    if (!user) return 'not-found'
    if (user.role === 'admin') return 'admin'
    await trx.updateTable('user').set({ banned: true, banReason: ban.category, banExpires: ban.until }).where('id', '=', id).execute()
    await trx.deleteFrom('session').where('userId', '=', id).execute()
    await trx
      .insertInto('admin_audit')
      .values({
        admin_user_id: adminUserId,
        action: 'user.ban',
        target: id,
        detail: JSON.stringify({ category: ban.category, note: ban.note, until: ban.until?.toISOString() ?? null }),
      })
      .execute()
    return 'ok'
  })
}

/** Lifts a user's ban (a timed one may have ended already) and records it in admin_audit. */
export async function unbanUser(db: Kysely<Database>, adminUserId: string, id: string): Promise<'ok' | 'not-found'> {
  return db.transaction().execute(async trx => {
    const user = await trx
      .selectFrom('user')
      .select(['banned', 'banReason', 'banExpires'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst()
    if (!user) return 'not-found'
    await trx.updateTable('user').set({ banned: false, banReason: null, banExpires: null }).where('id', '=', id).execute()
    await trx
      .insertInto('admin_audit')
      .values({
        admin_user_id: adminUserId,
        action: 'user.unban',
        target: id,
        detail: JSON.stringify({ was: activeBan(user) }),
      })
      .execute()
    return 'ok'
  })
}

export interface UserAuditRow {
  id: string
  action: string
  target: string
  detail: unknown
  createdAt: Date
  admin: { id: string; name: string } | null
}

/**
 * What admins did to this account (target = their id) or to a game they own or played in (the
 * game audit rows carry `ownerUserId` and `players[].user_id` in their detail), newest first.
 */
export async function listUserAudit(db: Kysely<Database>, userId: string, limit = 200): Promise<UserAuditRow[]> {
  const rows = await db
    .selectFrom('admin_audit as a')
    .leftJoin('user as u', 'u.id', 'a.admin_user_id')
    .select(['a.id', 'a.action', 'a.target', 'a.detail', 'a.created_at', 'u.id as adminId', 'u.name as adminName'])
    .where(eb =>
      eb.or([
        eb('a.target', '=', userId),
        eb(sql`a.detail->>'ownerUserId'`, '=', userId),
        sql<boolean>`a.detail->'players' @> ${JSON.stringify([{ user_id: userId }])}::jsonb`,
      ]),
    )
    .orderBy('a.created_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(limit)
    .execute()
  return rows.map(r => ({
    id: r.id,
    action: r.action,
    target: r.target,
    detail: r.detail,
    createdAt: r.created_at,
    admin: r.adminId && r.adminName ? { id: r.adminId, name: r.adminName } : null,
  }))
}

export interface UserActivity {
  account: { friends: number; country: string | null; xp: number; boards: { id: string; name: string }[] }
  games: {
    total: number
    last30Days: number
    lastAt: Date | null
    byMode: { mode: string; count: number }[]
    ranked: { games: number; ratings: { mode: '1v1' | '2v2'; rating: number; rankIndex: number | null; matches: number }[] }
  }
  /** Darts of finished and running games (bull-off darts left out); the camera ones are the board's, the rest typed in. */
  darts: { total: number; manual: number; last30Days: number; manualLast30Days: number }
}

/** What an account has done, aggregated in SQL; games that were invalidated or aborted don't count. Null: no such account. */
export async function getUserActivity(db: Kysely<Database>, userId: string): Promise<UserActivity | null> {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [boards, friends, user, progress, byMode, ranked, ratings, darts] = await Promise.all([
    db.selectFrom('boards').select(['id', 'name']).where('owner_user_id', '=', userId).orderBy('created_at').execute(),
    db
      .selectFrom('friendships')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('status', '=', 'accepted')
      .where(eb => eb.or([eb('requester_id', '=', userId), eb('addressee_id', '=', userId)]))
      .executeTakeFirstOrThrow(),
    db.selectFrom('user').select('country').where('id', '=', userId).executeTakeFirst(),
    getProgress(db, userId),
    db
      .selectFrom('game_players as gp')
      .innerJoin('game_sessions as gs', 'gs.id', 'gp.session_id')
      .select([
        'gs.game_id as mode',
        sql<number>`count(*)::int`.as('count'),
        sql<number>`count(*) FILTER (WHERE gs.created_at >= ${since})::int`.as('recent'),
        sql<Date>`max(gs.created_at)`.as('last'),
      ])
      .where('gp.user_id', '=', userId)
      .where('gs.status', '=', 'finished')
      .where('gs.invalidated_at', 'is', null)
      .groupBy('gs.game_id')
      .orderBy('count', 'desc')
      .execute(),
    db
      .selectFrom('ranked_results')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('user_id', '=', userId)
      .where(counts())
      .executeTakeFirstOrThrow(),
    db.selectFrom('ranked_ratings').select(['mode', 'rating', 'rank_index', 'matches']).where('user_id', '=', userId).execute(),
    sql<{ total: number; manual: number; recent: number; manual_recent: number }>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE d.source = 'manual')::int AS manual,
             count(*) FILTER (WHERE d.thrown_at >= ${since})::int AS recent,
             count(*) FILTER (WHERE d.source = 'manual' AND d.thrown_at >= ${since})::int AS manual_recent
      FROM game_darts d
      JOIN game_players gp ON gp.session_id = d.session_id AND gp.seat = d.seat
      JOIN game_sessions gs ON gs.id = d.session_id
      WHERE gp.user_id = ${userId} AND d.phase = 'game' AND gs.status <> 'aborted' AND gs.invalidated_at IS NULL`
      .execute(db)
      .then(r => r.rows[0]),
  ])
  if (!user) return null
  return {
    account: { friends: friends.n, country: user.country, xp: progress.xp, boards },
    games: {
      total: byMode.reduce((n, m) => n + m.count, 0),
      last30Days: byMode.reduce((n, m) => n + m.recent, 0),
      lastAt: byMode.reduce<Date | null>((l, m) => (l && l > m.last ? l : m.last), null),
      byMode: byMode.map(m => ({ mode: m.mode, count: m.count })),
      ranked: {
        games: ranked.n,
        ratings: ratings.map(r => ({ mode: r.mode, rating: r.rating, rankIndex: r.rank_index, matches: r.matches })),
      },
    },
    darts: { total: darts.total, manual: darts.manual, last30Days: darts.recent, manualLast30Days: darts.manual_recent },
  }
}

/** The ids of the boards each of these users owns (a bridge connects per board). */
export async function boardIdsByOwner(db: Kysely<Database>, userIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (userIds.length === 0) return out
  const rows = await db.selectFrom('boards').select(['id', 'owner_user_id']).where('owner_user_id', 'in', userIds).execute()
  for (const r of rows) out.set(r.owner_user_id, [...(out.get(r.owner_user_id) ?? []), r.id])
  return out
}
