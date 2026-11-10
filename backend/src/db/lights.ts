// WLED devices paired to a board, and the board's lights master switch (#135).
import { type Kysely } from 'kysely'
import { ulid } from 'ulid'
import type { Database } from './schema.js'
import { DEFAULT_PROFILE, DEFAULT_SEAT_COLORS } from '../shared/lights/profile.js'
import type { Profile, Rule, SegmentMode } from '../shared/lights/types.js'

export type WledDeviceRow = {
  id: string
  board_id: string
  mac: string
  name: string
  host: string
  leds: number
  version: string
  segments: number
  segment_mode: SegmentMode
  max_bri: number
  created_at: Date
}
export type NewWledDevice = Omit<WledDeviceRow, 'id' | 'created_at'>

export async function listWledDevices(db: Kysely<Database>, boardId: string): Promise<WledDeviceRow[]> {
  return db.selectFrom('wled_devices').selectAll().where('board_id', '=', boardId).orderBy('created_at').orderBy('id').execute()
}

/** Throws on a duplicate (board_id, mac). */
export async function insertWledDevice(db: Kysely<Database>, d: NewWledDevice): Promise<WledDeviceRow> {
  return db
    .insertInto('wled_devices')
    .values({ id: ulid(), ...d })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateWledDevice(
  db: Kysely<Database>,
  boardId: string,
  id: string,
  patch: Partial<Pick<WledDeviceRow, 'name' | 'segment_mode' | 'max_bri'>>,
): Promise<WledDeviceRow | undefined> {
  return db.updateTable('wled_devices').set(patch).where('id', '=', id).where('board_id', '=', boardId).returningAll().executeTakeFirst()
}

export async function deleteWledDevice(db: Kysely<Database>, boardId: string, id: string): Promise<boolean> {
  const result = await db.deleteFrom('wled_devices').where('id', '=', id).where('board_id', '=', boardId).executeTakeFirst()
  return result.numDeletedRows > 0n
}

/** Refreshes a board's devices from a WLED scan, by MAC. True if any row changed. */
export async function rehostWledDevices(
  db: Kysely<Database>,
  boardId: string,
  found: { mac: string; host: string; version: string; leds: number; segments: number }[],
): Promise<boolean> {
  let changed = false
  for (const f of found) {
    const result = await db
      .updateTable('wled_devices')
      .set({ host: f.host, version: f.version, leds: f.leds, segments: f.segments })
      .where('board_id', '=', boardId)
      .where('mac', '=', f.mac)
      .where(eb =>
        eb.or([eb('host', '!=', f.host), eb('version', '!=', f.version), eb('leds', '!=', f.leds), eb('segments', '!=', f.segments)]),
      )
      .executeTakeFirst()
    if (result.numUpdatedRows > 0n) changed = true
  }
  return changed
}

export async function getLightsEnabled(db: Kysely<Database>, boardId: string): Promise<boolean> {
  const row = await db.selectFrom('boards').select('lights_enabled').where('id', '=', boardId).executeTakeFirst()
  return row?.lights_enabled ?? true
}

export async function setLightsEnabled(db: Kysely<Database>, boardId: string, enabled: boolean): Promise<void> {
  await db.updateTable('boards').set({ lights_enabled: enabled }).where('id', '=', boardId).execute()
}

/** A profile as the lights use it: the built-in one, or one of the player's own. */
export type BoardProfile = Profile & { builtIn: boolean }

export const BUILT_IN_PROFILE_ID = DEFAULT_PROFILE.id

/** Null goes back to the built-in colours. */
export async function setSeatColors(db: Kysely<Database>, boardId: string, colors: string[] | null): Promise<void> {
  await db
    .updateTable('boards')
    .set({ light_seat_colors: colors && JSON.stringify(colors) })
    .where('id', '=', boardId)
    .execute()
}

/** What the board's lights run: the profile it selected, else the built-in one with the board's own seat colours. */
export async function getBoardProfile(db: Kysely<Database>, boardId: string): Promise<BoardProfile> {
  const row = await db
    .selectFrom('boards')
    .leftJoin('light_profiles', 'light_profiles.id', 'boards.light_profile_id')
    .select([
      'boards.light_seat_colors as boardColors',
      'light_profiles.id as profileId',
      'light_profiles.name as name',
      'light_profiles.seat_colors as seatColors',
      'light_profiles.rules as rules',
    ])
    .where('boards.id', '=', boardId)
    .executeTakeFirst()
  if (row?.profileId && row.name && row.seatColors && row.rules) {
    return { id: row.profileId, name: row.name, seatColors: row.seatColors, rules: row.rules, builtIn: false }
  }
  return { ...DEFAULT_PROFILE, seatColors: row?.boardColors ?? DEFAULT_SEAT_COLORS, builtIn: true }
}

export type LightProfileRow = { id: string; owner_user_id: string; name: string; seat_colors: string[]; rules: Rule[] }

export async function listLightProfiles(db: Kysely<Database>, userId: string): Promise<LightProfileRow[]> {
  return db.selectFrom('light_profiles').selectAll().where('owner_user_id', '=', userId).orderBy('created_at').orderBy('id').execute()
}

export async function insertLightProfile(
  db: Kysely<Database>,
  p: { ownerUserId: string; name: string; seatColors: readonly string[]; rules: readonly Rule[] },
): Promise<LightProfileRow> {
  return db
    .insertInto('light_profiles')
    .values({
      id: ulid(),
      owner_user_id: p.ownerUserId,
      name: p.name,
      seat_colors: JSON.stringify(p.seatColors),
      rules: JSON.stringify(p.rules),
    })
    .returning(['id', 'owner_user_id', 'name', 'seat_colors', 'rules'])
    .executeTakeFirstOrThrow()
}

/** True if the player had such a profile. Boards using it go back to the built-in one (the FK). */
export async function deleteLightProfile(db: Kysely<Database>, userId: string, profileId: string): Promise<boolean> {
  const result = await db.deleteFrom('light_profiles').where('id', '=', profileId).where('owner_user_id', '=', userId).executeTakeFirst()
  return result.numDeletedRows > 0n
}

/** Null selects the built-in profile. */
export async function setBoardProfile(db: Kysely<Database>, boardId: string, profileId: string | null): Promise<void> {
  await db.updateTable('boards').set({ light_profile_id: profileId }).where('id', '=', boardId).execute()
}

export async function setProfileSeatColors(db: Kysely<Database>, profileId: string, colors: readonly string[]): Promise<void> {
  await db
    .updateTable('light_profiles')
    .set({ seat_colors: JSON.stringify(colors) })
    .where('id', '=', profileId)
    .execute()
}

/** The owner of a board; null when the board is gone. */
export async function boardOwner(db: Kysely<Database>, boardId: string): Promise<string | null> {
  const row = await db.selectFrom('boards').select('owner_user_id').where('id', '=', boardId).executeTakeFirst()
  return row?.owner_user_id ?? null
}

/** Every board that has at least one paired WLED. */
export async function boardsWithWledDevices(db: Kysely<Database>): Promise<string[]> {
  const rows = await db.selectFrom('wled_devices').select('board_id').distinct().execute()
  return rows.map(r => r.board_id)
}
