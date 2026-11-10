import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, DEFAULT_SEAT_COLORS, ruleKey } from '../shared/lights/profile.js'
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
  setEffectEnabled,
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

  describe('switching effects on and off', () => {
    const turnOther = DEFAULT_PROFILE.rules.findIndex(r => ruleKey(r) === 'turn|other||')
    const lobby = DEFAULT_PROFILE.rules.findIndex(r => r.when.trigger === 'lobby')
    const enabledOf = async () => (await getBoardProfile(db, 'b1')).rules.map(r => r.enabled)

    it('on the built-in profile it is kept on the board, both ways, and only for that effect', async () => {
      const shipped = DEFAULT_PROFILE.rules.map(r => r.enabled)
      expect(await enabledOf()).toEqual(shipped)
      expect(await setEffectEnabled(db, 'b1', turnOther, false)).toBe(true)
      expect(await setEffectEnabled(db, 'b1', lobby, true)).toBe(true) // Lobby ships off
      expect(await enabledOf()).toEqual(shipped.map((on, i) => (i === turnOther ? false : i === lobby ? true : on)))
      expect(await setEffectEnabled(db, 'b1', turnOther, true)).toBe(true)
      expect((await enabledOf())[turnOther]).toBe(true)
      // The shipped profile itself is untouched
      expect(DEFAULT_PROFILE.rules.map(r => r.enabled)).toEqual(shipped)
      await db.updateTable('boards').set({ light_effect_overrides: null }).where('id', '=', 'b1').execute()
    })

    it('keeps only what differs from the shipped default: off then on leaves nothing behind', async () => {
      const overrides = async () =>
        (await db.selectFrom('boards').select('light_effect_overrides').where('id', '=', 'b1').executeTakeFirstOrThrow())
          .light_effect_overrides
      await setEffectEnabled(db, 'b1', turnOther, false)
      await setEffectEnabled(db, 'b1', lobby, true)
      expect(await overrides()).toEqual({
        [ruleKey(DEFAULT_PROFILE.rules[turnOther])]: false,
        [ruleKey(DEFAULT_PROFILE.rules[lobby])]: true,
      })
      await setEffectEnabled(db, 'b1', turnOther, true) // back to the default: its key goes, the other stays
      expect(await overrides()).toEqual({ [ruleKey(DEFAULT_PROFILE.rules[lobby])]: true })
      await setEffectEnabled(db, 'b1', lobby, false) // the last one: no overrides at all
      expect(await overrides()).toBeNull()
      await setEffectEnabled(db, 'b1', lobby, false) // already the default, and nothing to remove
      expect(await overrides()).toBeNull()
    })

    it('on a profile of the player’s own it is kept in the profile, not on the board', async () => {
      const own = await insertLightProfile(db, {
        ownerUserId: 'u1',
        name: 'Toggles',
        seatColors: DEFAULT_SEAT_COLORS,
        rules: DEFAULT_PROFILE.rules,
      })
      await setBoardProfile(db, 'b1', own.id)
      expect(await setEffectEnabled(db, 'b1', 2, false)).toBe(true)
      expect((await getBoardProfile(db, 'b1')).rules.map(r => r.enabled)).toEqual(
        DEFAULT_PROFILE.rules.map((r, i) => (i === 2 ? false : r.enabled)),
      )
      expect(
        (await db.selectFrom('boards').select('light_effect_overrides').where('id', '=', 'b1').executeTakeFirstOrThrow())
          .light_effect_overrides,
      ).toBeNull()
      // back on the built-in profile the player's own switch is not there
      await setBoardProfile(db, 'b1', null)
      expect(await enabledOf()).toEqual(DEFAULT_PROFILE.rules.map(r => r.enabled))
      await deleteLightProfile(db, 'u1', own.id)
    })

    it('says no to an effect the profile does not have', async () => {
      for (const index of [-1, DEFAULT_PROFILE.rules.length, 1.5, Number.NaN])
        expect(await setEffectEnabled(db, 'b1', index, false)).toBe(false)
      expect(await setEffectEnabled(db, 'nope', 0, false)).toBe(true) // a board that is gone reads as the built-in profile; the update matches no row
    })
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
