import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, DEFAULT_SEAT_COLORS } from '../shared/lights/profile.js'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { insertBoard } from './queries.js'
import { insertUsers } from '../test/fixtures.js'
import {
  deleteLightProfile,
  deleteWledDevice,
  getBoardProfile,
  insertLightProfile,
  listLightProfiles,
  setBoardProfile,
  setProfileSeatColors,
  getLightsEnabled,
  insertWledDevice,
  listWledDevices,
  rehostWledDevices,
  setLightsEnabled,
  setSeatColors,
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
    await insertUsers(db, [
      { id: 'u1', name: 'One', email: 'one@example.com' },
      { id: 'u2', name: 'Two', email: 'two@example.com' },
    ])
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
  it('a board runs the built-in profile with its own seat colours until it selects one of the player’s', async () => {
    const six = ['#010203', '#040506', '#070809', '#0a0b0c', '#0d0e0f', '#101112']
    expect(await getBoardProfile(db, 'b1')).toMatchObject({ id: 'default', builtIn: true, seatColors: DEFAULT_SEAT_COLORS })
    await setSeatColors(db, 'b1', six)
    expect(await getBoardProfile(db, 'b1')).toMatchObject({ builtIn: true, seatColors: six })
    await setSeatColors(db, 'b1', null)

    const rules = DEFAULT_PROFILE.rules.slice(0, 3)
    const own = await insertLightProfile(db, { ownerUserId: 'u1', name: 'Mine', seatColors: six, rules })
    expect((await listLightProfiles(db, 'u1')).map(p => p.name)).toEqual(['Mine'])
    await setBoardProfile(db, 'b1', own.id)
    expect(await getBoardProfile(db, 'b1')).toEqual({ id: own.id, name: 'Mine', builtIn: false, seatColors: six, rules })
    // the board's colours for the built-in profile don't leak into the player's own
    await setSeatColors(db, 'b1', ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'])
    expect((await getBoardProfile(db, 'b1')).seatColors).toEqual(six)
    await setProfileSeatColors(db, own.id, DEFAULT_SEAT_COLORS)
    expect((await getBoardProfile(db, 'b1')).seatColors).toEqual(DEFAULT_SEAT_COLORS)
    await setSeatColors(db, 'b1', null)
    await setBoardProfile(db, 'b1', null)
    expect((await getBoardProfile(db, 'b1')).builtIn).toBe(true)
  })

  it('a player’s profile names are unique to them, and others cannot delete them', async () => {
    const mine = (await listLightProfiles(db, 'u1'))[0]
    await expect(insertLightProfile(db, { ownerUserId: 'u1', name: 'Mine', seatColors: DEFAULT_SEAT_COLORS, rules: [] })).rejects.toThrow()
    await insertLightProfile(db, { ownerUserId: 'u2', name: 'Mine', seatColors: DEFAULT_SEAT_COLORS, rules: [] })
    expect(await deleteLightProfile(db, 'u2', mine.id)).toBe(false)
    expect(await listLightProfiles(db, 'u1')).toHaveLength(1)
  })

  it('deleting a profile puts the boards using it back on the built-in one', async () => {
    const mine = (await listLightProfiles(db, 'u1'))[0]
    await setBoardProfile(db, 'b1', mine.id)
    expect(await deleteLightProfile(db, 'u1', mine.id)).toBe(true)
    expect(await deleteLightProfile(db, 'u1', mine.id)).toBe(false)
    expect((await getBoardProfile(db, 'b1')).builtIn).toBe(true)
  })

  it('deleting the board deletes its devices', async () => {
    await db.deleteFrom('boards').where('id', '=', 'b1').execute()
    expect(await listWledDevices(db, 'b1')).toEqual([])
  })
})
