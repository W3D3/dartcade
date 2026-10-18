import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { insertBoard } from './queries.js'
import {
  deleteWledDevice,
  getLightsEnabled,
  insertWledDevice,
  listWledDevices,
  rehostWledDevices,
  setLightsEnabled,
  updateWledDevice,
} from './lights.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('wled lights', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const dev = {
    board_id: 'b1',
    mac: 'aa',
    name: 'Ring',
    host: '192.168.1.48',
    leds: 120,
    version: '0.15.0',
    segments: 1,
    segment_mode: 'whole' as const,
    max_bri: 178,
  }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('lights_db_test'))
    await db.insertInto('user').values({ id: 'u1', name: 'One', email: 'one@example.com', emailVerified: false, image: null }).execute()
    await insertBoard(db, { id: 'b1', owner_user_id: 'u1', name: 'Living room', token_hash: 'h-b1' })
  })
  afterAll(async () => {
    await close()
  })

  it('stores, lists, updates and deletes a device', async () => {
    const row = await insertWledDevice(db, dev)
    expect((await listWledDevices(db, 'b1')).map(d => d.id)).toEqual([row.id])
    expect((await updateWledDevice(db, 'b1', row.id, { max_bri: 100 }))?.max_bri).toBe(100)
    expect(await updateWledDevice(db, 'other', row.id, { max_bri: 1 })).toBeUndefined()
    expect(await deleteWledDevice(db, 'b1', row.id)).toBe(true)
    expect(await listWledDevices(db, 'b1')).toEqual([])
  })
  it('refuses the same MAC twice on a board', async () => {
    await insertWledDevice(db, { ...dev, mac: 'dup' })
    await expect(insertWledDevice(db, { ...dev, mac: 'dup' })).rejects.toThrow()
  })
  it('follows a device to its new host', async () => {
    await insertWledDevice(db, { ...dev, mac: 'mv' })
    expect(await rehostWledDevices(db, 'b1', [{ mac: 'mv', host: '192.168.1.99', version: '0.15.1', leds: 120, segments: 2 }])).toBe(true)
    expect((await listWledDevices(db, 'b1')).find(d => d.mac === 'mv')).toMatchObject({
      host: '192.168.1.99',
      version: '0.15.1',
      segments: 2,
    })
    expect(await rehostWledDevices(db, 'b1', [{ mac: 'mv', host: '192.168.1.99', version: '0.15.1', leds: 120, segments: 2 }])).toBe(false)
  })
  it('lights are on by default and can be turned off', async () => {
    expect(await getLightsEnabled(db, 'b1')).toBe(true)
    await setLightsEnabled(db, 'b1', false)
    expect(await getLightsEnabled(db, 'b1')).toBe(false)
  })
  it('deleting the board deletes its devices', async () => {
    await db.deleteFrom('boards').where('id', '=', 'b1').execute()
    expect(await listWledDevices(db, 'b1')).toEqual([])
  })
})
