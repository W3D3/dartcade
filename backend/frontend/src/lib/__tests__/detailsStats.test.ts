import { describe, it, expect } from 'vitest'
import type { StatRow } from '../api'
import { betterIndexes, formatStat, statNumber, targetLabel } from '../details/stats.js'

const r = (over: Partial<StatRow>): StatRow => ({ key: 'k', label: 'K', format: 'integer', better: 'higher', compact: false, ...over })

const seats = (...vs: (number | undefined)[]): Array<{ index: number; values: Record<string, number> }> =>
  vs.map((v, index) => {
    const values: Record<string, number> = v === undefined ? {} : { k: v }
    return { index, values }
  })

describe('formatStat', () => {
  it('formats each kind', () => {
    expect(formatStat(r({ format: 'decimal' }), { k: 83.94 })).toBe('83.9')
    expect(formatStat(r({ format: 'integer' }), { k: 6 })).toBe('6')
    expect(formatStat(r({ format: 'darts' }), { k: 15 })).toBe('15 darts')
    expect(formatStat(r({ format: 'darts' }), { k: 1 })).toBe('1 dart')
    expect(formatStat(r({ format: 'target' }), { k: 17 })).toBe('17')
    expect(formatStat(r({ format: 'target' }), { k: 21 })).toBe('25')
    expect(formatStat(r({ format: 'target' }), { k: 22 })).toBe('Bull')
    expect(formatStat(r({ format: 'ratio', value: 'h', of: 'a' }), { h: 3, a: 6 })).toBe('50% · 3/6')
  })
  it('shows a dash for what does not apply', () => {
    expect(formatStat(r({}), {})).toBe('—')
    expect(formatStat(r({ format: 'ratio', value: 'h', of: 'a' }), { h: 0, a: 0 })).toBe('—')
  })
})

describe('betterIndexes', () => {
  it('marks the higher or lower value', () => {
    expect([...betterIndexes(r({ better: 'higher' }), seats(83.9, 71.6))]).toEqual([0])
    expect([...betterIndexes(r({ better: 'lower' }), seats(15, 17))]).toEqual([0])
  })
  it('marks nobody without a direction, on a tie, or with one value', () => {
    expect(betterIndexes(r({ better: null }), seats(1, 2)).size).toBe(0)
    expect(betterIndexes(r({}), seats(4, 4)).size).toBe(0)
    expect(betterIndexes(r({}), seats(4)).size).toBe(0)
  })
  it('ignores missing values and compares ratios by rate', () => {
    expect([...betterIndexes(r({ better: 'lower' }), seats(undefined, 17))]).toEqual([])
    const ratio = r({ format: 'ratio', value: 'h', of: 'a' })
    const all = [
      { index: 0, values: { h: 3, a: 6 } },
      { index: 1, values: { h: 1, a: 4 } },
    ]
    expect([...betterIndexes(ratio, all)]).toEqual([0])
    expect(statNumber(ratio, all[0].values)).toBeCloseTo(0.5)
  })
  it('marks every seat sharing the best value in a party', () => {
    expect([...betterIndexes(r({}), seats(5, 7, 7))]).toEqual([1, 2])
  })
})

describe('targetLabel', () => {
  it('names the bull targets', () => {
    expect([targetLabel(20), targetLabel(21), targetLabel(22)]).toEqual(['20', '25', 'Bull'])
  })
})
