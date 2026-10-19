import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, match } from './index.js'
import { PRESET_180 } from './presets.js'

const rule = (t: Parameters<typeof match>[1], game: Parameters<typeof match>[2] = 'x01') => match(DEFAULT_PROFILE, t, game)

describe('match', () => {
  it('picks 180 over 100+ because it comes first', () => {
    expect(rule({ kind: 'visit', seat: 0, total: 180, local: true })?.look).toEqual({ preset: '180', state: PRESET_180 })
    expect(rule({ kind: 'visit', seat: 0, total: 140, local: true })?.look).toEqual({ color: 'seat', fx: 2, bri: 255 })
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
})
