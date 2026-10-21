import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import {
  contextFor,
  currentOverrides,
  evaluateAll,
  envFlagValues,
  flagEnabled,
  flagNumber,
  modeFlag,
  setupFlags,
  setOverrides,
  envFlagsOn,
} from './index.js'

const admin = { id: 'a', email: 'boss@x', role: 'admin' }
const player = { id: 'p', email: 'p@x', role: null }
const other = { id: 'o', email: 'o@x', role: null }

describe('flags', () => {
  beforeAll(() => setupFlags(new Set()))
  afterEach(() => setOverrides(new Map()))

  it('turns Minigolf on for admins only', async () => {
    expect(await flagEnabled('gamemode.minigolf.enabled', admin)).toBe(true)
    expect(await flagEnabled('gamemode.minigolf.enabled', player)).toBe(false)
    expect(await flagEnabled('gamemode.minigolf.enabled', null)).toBe(false)
  })

  it('turns a flag on for everyone with FLAGS_ON', async () => {
    await setupFlags(new Set(['gamemode.minigolf.enabled']))
    expect(await flagEnabled('gamemode.minigolf.enabled', player)).toBe(true)
    expect(await flagEnabled('gamemode.minigolf.enabled', null)).toBe(true)
    await setupFlags(new Set())
  })

  it('turns matchmaking on for admins only', async () => {
    expect(await flagEnabled('matchmaking.enabled', admin)).toBe(true)
    expect(await flagEnabled('matchmaking.enabled', player)).toBe(false)
  })

  it('reads FLAGS_ON from the environment', () => {
    process.env.FLAGS_ON = ' gamemode.minigolf.enabled , other '
    expect([...envFlagsOn()]).toEqual(['gamemode.minigolf.enabled', 'other'])
    delete process.env.FLAGS_ON
  })

  it('gives the ranked time limit 60 s a visit and a 3 min reserve, unless FLAG_VALUES sets them', async () => {
    expect(await flagNumber('matchmaking.visitSeconds', 0, player)).toBe(60)
    expect(await flagNumber('matchmaking.reserveSeconds', 0, null)).toBe(180)
    await setupFlags(new Set(), new Map([['matchmaking.visitSeconds', 45]]))
    expect(await flagNumber('matchmaking.visitSeconds', 0, player)).toBe(45)
    expect(await flagNumber('matchmaking.reserveSeconds', 0, player)).toBe(180)
    await setupFlags(new Set())
  })

  it('reads FLAG_VALUES from the environment and refuses a bad entry', () => {
    process.env.FLAG_VALUES = ' matchmaking.visitSeconds = 45 ,matchmaking.reserveSeconds=120'
    expect([...envFlagValues()]).toEqual([
      ['matchmaking.visitSeconds', 45],
      ['matchmaking.reserveSeconds', 120],
    ])
    for (const bad of [
      'matchmaking.visitSeconds=soon',
      'matchmaking.enabled=1',
      'nope=3',
      'matchmaking.visitSeconds=',
      'matchmaking.visitSeconds',
    ]) {
      process.env.FLAG_VALUES = bad
      expect(() => envFlagValues()).toThrow('FLAG_VALUES')
    }
    delete process.env.FLAG_VALUES
  })

  it('builds the context from the user, an anonymous one signed out', () => {
    expect(contextFor(admin)).toEqual({ targetingKey: 'a', email: 'boss@x', admin: true })
    expect(contextFor(null)).toEqual({ targetingKey: 'anonymous' })
  })

  it('evaluates every flag', async () => {
    expect(await evaluateAll(admin)).toEqual([
      { key: 'gamemode.minigolf.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'gamemode.p121.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'gamemode.hilo.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'matchmaking.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'progression.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'lights.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'caller.autodartsImport', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'avatar.upload.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'matchmaking.visitSeconds', value: 60, reason: 'STATIC', variant: 'default' },
      { key: 'matchmaking.reserveSeconds', value: 180, reason: 'STATIC', variant: 'default' },
    ])
  })

  it('knows which modes have a flag', () => {
    expect(modeFlag('minigolf')).toBe('gamemode.minigolf.enabled')
    expect(modeFlag('x01')).toBeNull()
  })

  describe('overrides', () => {
    const key = 'gamemode.p121.enabled' // admins-only by default, so 'off' and 'admins' modes change nothing observable but the rule

    it('off: nobody, admin included', async () => {
      await setOverrides(new Map([[key, { mode: 'off', userIds: [] }]]))
      expect(await flagEnabled(key, admin)).toBe(false)
      expect(await flagEnabled(key, player)).toBe(false)
      expect(await flagEnabled(key, null)).toBe(false)
    })

    it('admins: only ctx.admin === true', async () => {
      await setOverrides(new Map([[key, { mode: 'admins', userIds: [] }]]))
      expect(await flagEnabled(key, admin)).toBe(true)
      expect(await flagEnabled(key, player)).toBe(false)
      expect(await flagEnabled(key, null)).toBe(false)
    })

    it('users: admins and the listed users, nobody else', async () => {
      await setOverrides(new Map([[key, { mode: 'users', userIds: [player.id] }]]))
      expect(await flagEnabled(key, admin)).toBe(true)
      expect(await flagEnabled(key, player)).toBe(true)
      expect(await flagEnabled(key, other)).toBe(false)
      expect(await flagEnabled(key, null)).toBe(false)
    })

    it('users mode ignores an id nobody has (a deleted user) rather than matching anyone', async () => {
      await setOverrides(new Map([[key, { mode: 'users', userIds: ['long-gone'] }]]))
      expect(await flagEnabled(key, player)).toBe(false)
      expect(await flagEnabled(key, other)).toBe(false)
    })

    it('on: everyone, signed out too', async () => {
      await setOverrides(new Map([[key, { mode: 'on', userIds: [] }]]))
      expect(await flagEnabled(key, player)).toBe(true)
      expect(await flagEnabled(key, null)).toBe(true)
    })

    it('a number override wins over FLAG_VALUES', async () => {
      await setupFlags(new Set(), new Map([['matchmaking.visitSeconds', 45]]))
      await setOverrides(new Map([['matchmaking.visitSeconds', { number: 90 }]]))
      expect(await flagNumber('matchmaking.visitSeconds', 0, player)).toBe(90)
      await setupFlags(new Set())
    })

    it('setOverrides(new Map()) returns to defaults, with and without FLAGS_ON', async () => {
      await setOverrides(new Map([[key, { mode: 'on', userIds: [] }]]))
      await setOverrides(new Map())
      expect(await flagEnabled(key, player)).toBe(false)

      await setupFlags(new Set([key]))
      await setOverrides(new Map([[key, { mode: 'off', userIds: [] }]]))
      await setOverrides(new Map())
      expect(await flagEnabled(key, player)).toBe(true)
      await setupFlags(new Set())
    })

    it('setupFlags after setOverrides keeps the overrides', async () => {
      await setOverrides(new Map([[key, { mode: 'on', userIds: [] }]]))
      await setupFlags(new Set())
      expect(await flagEnabled(key, player)).toBe(true)
      expect(currentOverrides().get(key)).toEqual({ mode: 'on', userIds: [] })
    })
  })
})
