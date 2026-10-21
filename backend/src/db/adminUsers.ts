// Admin-only user listing and role changes (schema/api-v1.yaml, tag admin; api/adminUsers.ts).
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { toAvatar, type Avatar } from './users.js'

export type AdminUserRow = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: 'admin' | 'moderator' | null
  createdAt: Date
  lastLoginAt: Date | null
  avatar: Avatar
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
  'avatar_version',
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
  avatar_version: number
}): AdminUserRow => ({
  id: r.id,
  name: r.name,
  email: r.email,
  emailVerified: r.emailVerified,
  role: r.role === 'admin' || r.role === 'moderator' ? r.role : null,
  createdAt: r.createdAt,
  lastLoginAt: r.last_login_at,
  avatar: toAvatar(r),
})

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
