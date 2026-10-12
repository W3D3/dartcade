import { describe, it, expect, beforeAll } from 'vitest'
import { contextFor, evaluateAll, flagEnabled, modeFlag, setupFlags, envFlagsOn } from './index.js'

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

  it('reads FLAGS_ON from the environment', () => {
    process.env.FLAGS_ON = ' gamemode.minigolf.enabled , other '
    expect([...envFlagsOn()]).toEqual(['gamemode.minigolf.enabled', 'other'])
    delete process.env.FLAGS_ON
  })

  it('builds the context from the user, an anonymous one signed out', () => {
    expect(contextFor(admin)).toEqual({ targetingKey: 'a', email: 'boss@x', admin: true })
    expect(contextFor(null)).toEqual({ targetingKey: 'anonymous' })
  })

  it('evaluates every flag', async () => {
    expect(await evaluateAll(admin)).toEqual([{ key: 'gamemode.minigolf.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' }])
  })

  it('knows which modes have a flag', () => {
    expect(modeFlag('minigolf')).toBe('gamemode.minigolf.enabled')
    expect(modeFlag('x01')).toBeNull()
  })
})
