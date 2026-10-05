import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'

/** The signed-in account as /api/me shows it. */
export type Account = { id: string; name: string; email: string; nameNeedsChange: boolean; invisible: boolean }

export async function getAccount(db: Kysely<Database>, userId: string): Promise<Account | undefined> {
  const row = await db
    .selectFrom('user')
    .select(['id', 'name', 'email', 'name_needs_change', 'invisible'])
    .where('id', '=', userId)
    .executeTakeFirst()
  return row && { id: row.id, name: row.name, email: row.email, nameNeedsChange: row.name_needs_change, invisible: row.invisible }
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
