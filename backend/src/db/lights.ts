// WLED devices paired to a board, and the board's lights master switch (#135).
import { type Kysely } from 'kysely'
import { ulid } from 'ulid'
import type { Database } from './schema.js'
import type { SegmentMode } from '../shared/lights/types.js'

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
