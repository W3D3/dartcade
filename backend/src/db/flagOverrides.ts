// Flag overrides an admin sets at runtime (migration 025), loaded once at startup (index.ts) and
// kept in flags/index.ts's module state; the admin API (api/adminFlags.ts) writes them here and
// calls setOverrides again.
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

export type FlagOverride = { mode: 'off' | 'admins' | 'users' | 'on'; userIds: string[] } | { number: number }

/** Every flag override, keyed by key; no entry for a key means today's default behaviour. */
export async function loadOverrides(
  db: Kysely<Database>,
): Promise<Map<string, FlagOverride & { updatedBy: string | null; updatedAt: Date }>> {
  const rows = await db.selectFrom('feature_flag_overrides').selectAll().execute()
  const out = new Map<string, FlagOverride & { updatedBy: string | null; updatedAt: Date }>()
  for (const r of rows) {
    if (r.mode) out.set(r.key, { mode: r.mode, userIds: r.user_ids, updatedBy: r.updated_by, updatedAt: r.updated_at })
    else if (r.number !== null) out.set(r.key, { number: r.number, updatedBy: r.updated_by, updatedAt: r.updated_at })
    // else: a row with neither set, which upsertOverride never writes; skip it rather than guess
  }
  return out
}

/** Sets a key's override (a mode or a number), replacing any existing one. */
export async function upsertOverride(db: Kysely<Database>, key: string, o: FlagOverride, by: string): Promise<void> {
  const values = {
    key,
    mode: 'mode' in o ? o.mode : null,
    user_ids: 'mode' in o ? o.userIds : [],
    number: 'number' in o ? o.number : null,
    updated_by: by,
    updated_at: new Date(),
  }
  await db
    .insertInto('feature_flag_overrides')
    .values(values)
    .onConflict(oc =>
      oc.column('key').doUpdateSet({
        mode: values.mode,
        user_ids: values.user_ids,
        number: values.number,
        updated_by: values.updated_by,
        updated_at: values.updated_at,
      }),
    )
    .execute()
}

/** Removes a key's override, back to its default behaviour. */
export async function deleteOverride(db: Kysely<Database>, key: string): Promise<void> {
  await db.deleteFrom('feature_flag_overrides').where('key', '=', key).execute()
}
