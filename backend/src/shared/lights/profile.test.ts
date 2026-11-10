import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, match, ruleKey } from './index.js'
import { PRESET_180 } from './presets.js'

const rule = (t: Parameters<typeof match>[1], game: Parameters<typeof match>[2] = 'x01') => match(DEFAULT_PROFILE, t, game)

describe('match', () => {
  it('picks 180 over 100+ because it comes first', () => {
    expect(rule({ kind: 'visit', seat: 0, total: 180, local: true })?.look).toEqual({ preset: '180', state: PRESET_180 })
    expect(rule({ kind: 'visit', seat: 0, total: 140, local: true })?.look).toEqual({ color: '#ffffff', fx: 20, bri: 255 })
  })
  it('ignores visits under 100', () => {
    expect(rule({ kind: 'visit', seat: 0, total: 60, local: true })).toBeNull()
  })
  it('flashes only for this board in remote games', () => {
    expect(rule({ kind: 'bust', seat: 1, local: false })).toBeNull()
    expect(rule({ kind: 'bust', seat: 1, local: true })?.type).toBe('flash')
  })
  it('shows the waiting scene on the other board’s turn', () => {
    const r = rule({ kind: 'turn', seat: 1, local: false })
    expect(r?.type).toBe('scene')
    expect(r?.look).toEqual({ color: '#ffffff', fx: 0, bri: 40 })
  })
  it('a big score sparkles white instead of flashing the player colour', () => {
    const r = rule({ kind: 'visit', seat: 1, total: 120, local: true })
    expect(r?.type).toBe('flash')
    expect(r?.look).toMatchObject({ color: '#ffffff', fx: 20 })
  })
  it('has no rule for a target hit', () => {
    expect(DEFAULT_PROFILE.rules.map(r => r.when.trigger)).not.toContain('atc.hit')
  })
  it('keeps the lobby scene off by default and never matches a disabled rule', () => {
    expect(DEFAULT_PROFILE.rules.find(r => r.when.trigger === 'lobby')?.enabled).toBe(false)
    expect(rule({ kind: 'lobby', local: true }, null)).toBeNull()
    const on = { ...DEFAULT_PROFILE, rules: DEFAULT_PROFILE.rules.map(r => ({ ...r, enabled: true })) }
    expect(match(on, { kind: 'lobby', local: true }, null)?.look).toMatchObject({ bri: 60 })
  })
  it('has no rule for takeout.finished (the service restores the game scene)', () => {
    expect(rule({ kind: 'takeout.finished', local: true }, null)).toBeNull()
  })
  it('respects a game filter', () => {
    const p = {
      ...DEFAULT_PROFILE,
      rules: [{ ...DEFAULT_PROFILE.rules[0], when: { ...DEFAULT_PROFILE.rules[0].when, game: 'atc' as const } }],
    }
    expect(match(p, { kind: 'turn', seat: 0, local: true }, 'x01')).toBeNull()
    expect(match(p, { kind: 'turn', seat: 0, local: true }, 'atc')).not.toBeNull()
  })
  it('gives every built-in effect its own key, which does not depend on its place in the list', () => {
    const keys = DEFAULT_PROFILE.rules.map(ruleKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...DEFAULT_PROFILE.rules].reverse().map(ruleKey)).toEqual([...keys].reverse())
    expect(keys).toContain('visit|mine||>=100')
    expect(keys).toContain('turn|other||')
  })
})
