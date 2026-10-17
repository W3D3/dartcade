import { describe, it, expect, beforeAll } from 'vitest'
import { contextFor, evaluateAll, envFlagValues, flagEnabled, flagNumber, modeFlag, setupFlags, envFlagsOn } from './index.js'

const admin = { id: 'a', email: 'boss@x', role: 'admin' }
const player = { id: 'p', email: 'p@x', role: null }

describe('flags', () => {
  beforeAll(() => setupFlags(new Set()))

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
      { key: 'caller.autodartsImport', value: true, reason: 'TARGETING_MATCH', variant: 'on' },
      { key: 'matchmaking.visitSeconds', value: 60, reason: 'STATIC', variant: 'default' },
      { key: 'matchmaking.reserveSeconds', value: 180, reason: 'STATIC', variant: 'default' },
    ])
  })

  it('knows which modes have a flag', () => {
    expect(modeFlag('minigolf')).toBe('gamemode.minigolf.enabled')
    expect(modeFlag('x01')).toBeNull()
  })
})
