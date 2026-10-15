import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import type { components } from '../schema/api.js'

export type Preferences = components['schemas']['Preferences']

/** The signed-in account as /api/me shows it. */
export type Account = {
  id: string
  name: string
  email: string
  nameNeedsChange: boolean
  invisible: boolean
  /** better-auth's admin role (migration 019); see auth/admin.ts for who is an admin. */
  role: string | null
  /** When the account was made, ISO 8601. */
  createdAt: string
}

export async function getAccount(db: Kysely<Database>, userId: string): Promise<Account | undefined> {
  const row = await db
    .selectFrom('user')
    .select(['id', 'name', 'email', 'name_needs_change', 'invisible', 'role', 'createdAt'])
    .where('id', '=', userId)
    .executeTakeFirst()
  return (
    row && {
      id: row.id,
      name: row.name,
      email: row.email,
      nameNeedsChange: row.name_needs_change,
      invisible: row.invisible,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
    }
  )
}

/** What decides whether someone is an admin (auth/admin.ts). */
export async function getRoleAndEmail(db: Kysely<Database>, userId: string): Promise<{ role: string | null; email: string } | undefined> {
  return db.selectFrom('user').select(['role', 'email']).where('id', '=', userId).executeTakeFirst()
}

/** Someone else holds this (normalized) name, ignoring case. Flagged names hold nothing (migration 013). */
export async function isNameTaken(db: Kysely<Database>, name: string, exceptUserId: string | null): Promise<boolean> {
  let q = db
    .selectFrom('user')
    .select('id')
    .where(sql<boolean>`lower(name) = lower(${name})`)
    .where('name_needs_change', '=', false)
  if (exceptUserId !== null) q = q.where('id', '!=', exceptUserId)
  return (await q.executeTakeFirst()) !== undefined
}

/** A checked name; the flag goes with it. */
export async function setName(db: Kysely<Database>, userId: string, name: string): Promise<void> {
  await db.updateTable('user').set({ name, name_needs_change: false }).where('id', '=', userId).execute()
}

/** Invisible: friends see the user as offline. */
export async function setInvisible(db: Kysely<Database>, userId: string, invisible: boolean): Promise<void> {
  await db.updateTable('user').set({ invisible }).where('id', '=', userId).execute()
}

/** The account-wide preferences the user has set; undefined for an unknown user. */
export async function getPreferences(db: Kysely<Database>, userId: string): Promise<Preferences | undefined> {
  const row = await db.selectFrom('user').select('preferences').where('id', '=', userId).executeTakeFirst()
  return row?.preferences
}

/** Sets the given preferences over the stored ones (the rest keep theirs) and answers with all of them. */
export async function updatePreferences(db: Kysely<Database>, userId: string, changes: Preferences): Promise<Preferences | undefined> {
  const row = await db
    .updateTable('user')
    .set({ preferences: sql`preferences || ${JSON.stringify(changes)}::jsonb` })
    .where('id', '=', userId)
    .returning('preferences')
    .executeTakeFirst()
  return row?.preferences
}
