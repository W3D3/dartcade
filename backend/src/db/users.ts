import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import type { components } from '../schema/api.js'
import { DEFAULT_AVATAR_FINISH, isAvatarFinish } from '../shared/avatarFinishes.js'

export type Preferences = components['schemas']['Preferences']
export type Avatar = components['schemas']['Avatar']
export type AvatarChoice = components['schemas']['AvatarChoice']

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
  avatar: Avatar
}

/** How the account can sign in (better-auth's account rows): with its password, through Discord, or both. */
export async function signInMethods(db: Kysely<Database>, userId: string): Promise<('password' | 'discord')[]> {
  const rows = await db.selectFrom('account').select(['providerId', 'password']).where('userId', '=', userId).execute()
  return [
    ...(rows.some(r => r.providerId === 'credential' && r.password) ? (['password'] as const) : []),
    ...(rows.some(r => r.providerId === 'discord') ? (['discord'] as const) : []),
  ]
}

/** The Avatar union shape from the avatar_* columns (migrations 031, 038). */
export function toAvatar(row: {
  avatar_kind: 'none' | 'preset' | 'upload'
  avatar_preset: string | null
  avatar_background: string | null
  avatar_version: number
}): Avatar {
  if (row.avatar_kind === 'preset')
    return {
      kind: 'preset',
      foreground: row.avatar_preset ?? DEFAULT_AVATAR_FINISH,
      background: row.avatar_background ?? DEFAULT_AVATAR_FINISH,
    }
  if (row.avatar_kind === 'upload') return { kind: 'upload', version: row.avatar_version }
  return { kind: 'none' }
}

export async function getAccount(db: Kysely<Database>, userId: string): Promise<Account | undefined> {
  const row = await db
    .selectFrom('user')
    .select([
      'id',
      'name',
      'email',
      'name_needs_change',
      'invisible',
      'role',
      'createdAt',
      'avatar_kind',
      'avatar_preset',
      'avatar_background',
      'avatar_version',
    ])
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
      avatar: toAvatar(row),
    }
  )
}

/** Thrown when a PATCH /api/me avatar choice names an unknown (or no) finish for a layer. */
export class UnknownAvatarFinishError extends Error {}

/** Sets the avatar to none, a built-in preset (foreground and background finishes picked independently), or (internally) an uploaded photo; bumps avatar_version. */
export async function setAvatar(db: Kysely<Database>, userId: string, choice: AvatarChoice): Promise<void> {
  if (choice.kind === 'preset')
    for (const id of [choice.foreground, choice.background])
      if (id === undefined || !isAvatarFinish(id)) throw new UnknownAvatarFinishError(id ?? '(none given)')
  await db
    .updateTable('user')
    .set(eb => ({
      avatar_kind: choice.kind,
      avatar_preset: choice.kind === 'preset' ? choice.foreground : null,
      avatar_background: choice.kind === 'preset' ? choice.background : null,
      avatar_image: null,
      avatar_content_type: null,
      avatar_version: eb('avatar_version', '+', 1),
    }))
    .where('id', '=', userId)
    .execute()
}

/** Sets the avatar to an uploaded photo; bumps avatar_version so GET /api/users/{id}/avatar?v= cache-busts. */
export async function setAvatarUpload(db: Kysely<Database>, userId: string, image: Buffer, contentType: string): Promise<void> {
  await db
    .updateTable('user')
    .set(eb => ({
      avatar_kind: 'upload',
      avatar_preset: null,
      avatar_background: null,
      avatar_image: image,
      avatar_content_type: contentType,
      avatar_version: eb('avatar_version', '+', 1),
    }))
    .where('id', '=', userId)
    .execute()
}

/** The bytes and content type of a user's uploaded avatar; undefined if they have none (or aren't using an upload). */
export async function getAvatarUpload(
  db: Kysely<Database>,
  userId: string,
): Promise<{ image: Buffer; contentType: string; version: number } | undefined> {
  const row = await db
    .selectFrom('user')
    .select(['avatar_kind', 'avatar_image', 'avatar_content_type', 'avatar_version'])
    .where('id', '=', userId)
    .executeTakeFirst()
  if (!row || row.avatar_kind !== 'upload' || row.avatar_image === null || row.avatar_content_type === null) return undefined
  return { image: row.avatar_image, contentType: row.avatar_content_type, version: row.avatar_version }
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
