import { describe, it, expect } from 'vitest'
import { x01Slots, atcSlots } from '../dartSlots.js'

const d = (name: string, score: number) => ({ segment: { name }, score })
const base = { outMode: 'double' as const, opened: true, bust: false, suggest: true }

describe('x01Slots', () => {
  it('shows thrown darts and suggests the checkout in the empty slots', () => {
    const s = x01Slots({ ...base, darts: [d('T20', 60)], remaining: 81 })
    expect(s.map(x => [x.kind, x.label, x.points, x.foot])).toEqual([
      ['thrown', 'T20', '60', ''],
      ['suggested-next', 'T19', '', 'leaves 24'],
      ['suggested-later', 'D12', '', 'to win the leg'],
    ])
    expect(s[0].aria).toBe('Dart 1: T20, 60 points. Correct this dart')
    expect(s[1].aria).toBe('Dart 2: suggested T19, leaves 24')
  })

  it('one-dart finish says game shot and leaves the last slot empty', () => {
    const s = x01Slots({ ...base, darts: [d('T20', 60)], remaining: 40 })
    expect(s.map(x => [x.kind, x.label, x.foot])).toEqual([
      ['thrown', 'T20', ''],
      ['suggested-next', 'D20', 'Game shot'],
      ['empty-later', '', ''],
    ])
  })

  it('a zero-point dart is a miss', () => {
    const s = x01Slots({ ...base, darts: [d('Miss', 0)], remaining: 301 })
    expect(s[0]).toMatchObject({ kind: 'miss', label: 'Miss', points: '0', aria: 'Dart 1: Miss, no hit. Correct this dart' })
  })

  it('no suggestion above 170: next and empty slots', () => {
    const s = x01Slots({ ...base, darts: [], remaining: 301 })
    expect(s.map(x => [x.kind, x.aria])).toEqual([
      ['empty-next', 'Dart 1: next'],
      ['empty-later', 'Dart 2: not thrown'],
      ['empty-later', 'Dart 3: not thrown'],
    ])
  })

  it('no suggestions before opening or when turned off', () => {
    expect(x01Slots({ ...base, opened: false, darts: [], remaining: 40 })[0].kind).toBe('empty-next')
    expect(x01Slots({ ...base, suggest: false, darts: [], remaining: 40 })[0].kind).toBe('empty-next')
  })

  it('fills the rest with bust slots', () => {
    const s = x01Slots({ ...base, bust: true, darts: [d('T20', 60)], remaining: 40 })
    expect(s.map(x => [x.kind, x.label])).toEqual([
      ['thrown', 'T20'],
      ['bust', 'Bust'],
      ['bust', 'Bust'],
    ])
  })

  it('never shows more than three slots', () => {
    expect(x01Slots({ ...base, darts: [d('S1', 1), d('S1', 1), d('S1', 1), d('S1', 1)], remaining: 97 })).toHaveLength(3)
  })
})

describe('atcSlots', () => {
  it('marks hits +1, misses 0, and suggests the target next', () => {
    const s = atcSlots({ darts: [d('S13', 13), d('S11', 11)], hits: [true, false], target: '14' })
    expect(s.map(x => [x.kind, x.label, x.points, x.foot])).toEqual([
      ['thrown', 'S13', '+1', ''],
      ['miss', 'S11', '0', ''],
      ['suggested-next', '14', '', 'your target'],
    ])
    expect(s[1].aria).toBe('Dart 2: S11, no hit. Correct this dart')
  })

  it('no suggestion without a target', () => {
    expect(atcSlots({ darts: [], hits: [], target: null })[0].kind).toBe('empty-next')
  })

  it('a triple advances three when the multiplier advances', () => {
    const s = atcSlots({
      darts: [{ segment: { name: 'T13', number: 13, multiplier: 3 }, score: 39 }],
      hits: [true],
      target: '16',
      multiplierAdvances: true,
    })
    expect(s[0].points).toBe('+3')
  })
  it('a bull always advances one', () => {
    const s = atcSlots({
      darts: [{ segment: { name: 'Bull', number: 50, multiplier: 1 }, score: 50 }],
      hits: [true],
      target: '✓',
      multiplierAdvances: true,
    })
    expect(s[0].points).toBe('+1')
  })
})
