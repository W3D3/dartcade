import { describe, it, expect } from 'vitest'
import { motionLabel, motionSince } from '../motion'

const at = '2026-01-01T10:00:00.000Z'
const t = (s: number) => Date.parse(at) + s * 1000

describe('motion diagnostics words', () => {
  it('names each state, a takeout with its size, and unknown for no report', () => {
    expect(motionLabel(null)).toBe('Unknown')
    expect(motionLabel({ state: 'hand', since: at })).toBe('Hand')
    expect(motionLabel({ state: 'takeout', takeout: 'partial', since: at })).toBe('Takeout (partial)')
    expect(motionLabel({ state: 'stable', since: at })).toBe('Stable')
  })

  it('says how long, in the coarsest whole unit', () => {
    const m = { state: 'dart' as const, since: at }
    expect(motionSince(null, t(5))).toBe('')
    expect(motionSince(m, t(-2))).toBe('for 0 s')
    expect(motionSince(m, t(12))).toBe('for 12 s')
    expect(motionSince(m, t(190))).toBe('for 3 min')
    expect(motionSince(m, t(7300))).toBe('for 2 h')
  })
})
