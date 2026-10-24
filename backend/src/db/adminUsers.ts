// Admin-only user listing and role changes (schema/api-v1.yaml, tag admin; api/adminUsers.ts).
import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { toAvatar, type Avatar } from './users.js'
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
  'avatar_color',
  'avatar_fg_color',
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
  avatar_color: string | null
  avatar_fg_color: string | null
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
