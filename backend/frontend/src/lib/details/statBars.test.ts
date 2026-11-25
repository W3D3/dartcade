import { describe, it, expect } from 'vitest'
import type { StatRow } from '../api'
import { barCells, duelShare } from './statBars'

const avg: StatRow = { key: 'average', label: 'Average', format: 'decimal', better: 'higher', compact: true }
const best: StatRow = { key: 'bestLegDarts', label: 'Best leg', format: 'darts', better: 'lower', compact: true }
const sides = (key: string, ...v: (number | null)[]) => v.map((n, index) => ({ index, values: n === null ? {} : { [key]: n } }))

describe('barCells', () => {
  it('scales each bar to the largest value and marks the highest as best', () => {
    const cells = barCells(avg, sides('average', 80, 40, 60))
    expect(cells.map(c => c.fraction)).toEqual([1, 0.5, 0.75])
    expect(cells.map(c => c.best)).toEqual([true, false, false])
    expect(cells[0].text).toBe('80.0')
  })
  it('inverts the highlight, not the bar, when fewer is better', () => {
    const cells = barCells(best, sides('bestLegDarts', 15, 30, 18))
    expect(cells.map(c => c.best)).toEqual([true, false, false])
    expect(cells.map(c => c.fraction)).toEqual([0.5, 1, 0.6])
  })
  it('gives a side without the stat an empty bar and a dash, never the best', () => {
    const cells = barCells(avg, sides('average', 70, null, 50))
    expect(cells[1]).toMatchObject({ text: '—', fraction: 0, best: false })
    expect(cells[0].best).toBe(true)
  })
  it('marks nobody on a tie or a lone value', () => {
    expect(barCells(avg, sides('average', 50, 50)).some(c => c.best)).toBe(false)
    expect(barCells(avg, sides('average', 50)).some(c => c.best)).toBe(false)
  })
  it('draws no bar when every value is zero', () => {
    expect(barCells(avg, sides('average', 0, 0)).map(c => c.fraction)).toEqual([0, 0])
  })
})

describe('duelShare', () => {
  it('splits by value, leaning to the better side', () => {
    expect(duelShare(avg, 60, 20)).toBe(0.75)
    expect(duelShare(best, 15, 45)).toBe(0.75)
    expect(duelShare(avg, 0, 0)).toBe(0.5)
  })
})
