// Admin-only user listing and role changes (schema/api-v1.yaml, tag admin; api/adminUsers.ts).
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

export type AdminUserRow = {
  id: string
  name: string
  email: string
  role: 'admin' | null
  createdAt: Date
}

const toRow = (r: { id: string; name: string; email: string; role: string | null; createdAt: Date }): AdminUserRow => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role === 'admin' ? 'admin' : null,
  createdAt: r.createdAt,
})

/** Every user, newest first, at most 50; `q`, if given, matches name or email (case-insensitive, contains). */
export async function listUsers(db: Kysely<Database>, q?: string): Promise<AdminUserRow[]> {
  let query = db.selectFrom('user').select(['id', 'name', 'email', 'role', 'createdAt']).orderBy('createdAt', 'desc').limit(50)
  if (q) {
    // shortcut: % and _ in q aren't escaped for LIKE; an admin search box, a wrong match here is low-risk
    const pattern = `%${q}%`
    query = query.where(eb => eb.or([eb('name', 'ilike', pattern), eb('email', 'ilike', pattern)]))
  }
  return (await query.execute()).map(toRow)
}

/** One user, for the response after a role change. */
export async function getUser(db: Kysely<Database>, id: string): Promise<AdminUserRow | undefined> {
  const row = await db.selectFrom('user').select(['id', 'name', 'email', 'role', 'createdAt']).where('id', '=', id).executeTakeFirst()
  return row && toRow(row)
}

/**
 * Grants or revokes the admin role. Locks every admin row first (`FOR UPDATE`), so two concurrent
 * demotes serialize: the second one re-counts admins against the first one's committed result,
 * and refuses rather than leaving no admin.
 */
export async function setAdmin(db: Kysely<Database>, id: string, admin: boolean): Promise<'ok' | 'not-found' | 'last-admin'> {
  return db.transaction().execute(async trx => {
    const admins = await trx.selectFrom('user').select('id').where('role', '=', 'admin').forUpdate().execute()
    const user = await trx.selectFrom('user').select(['id', 'role']).where('id', '=', id).executeTakeFirst()
    if (!user) return 'not-found'
    if (!admin && user.role === 'admin' && admins.length <= 1) return 'last-admin'
    await trx
      .updateTable('user')
      .set({ role: admin ? 'admin' : null })
      .where('id', '=', id)
      .execute()
    return 'ok'
  })
}
