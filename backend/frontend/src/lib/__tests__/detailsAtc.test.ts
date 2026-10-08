import { describe, it, expect } from 'vitest'
import type { AtcDetail } from '../api'
import { atcResult, hardestLine, raceSeries, targetGrid } from '../details/atc.js'

const detail = {
  mode: 'atc',
  sequence: [1, 2, 3],
  visits: [],
  progress: [
    {
      seat: 0,
      steps: [
        { target: 1, darts: 2, hit: true },
        { target: 2, darts: 0, hit: true },
        { target: 3, darts: 5, hit: false },
      ],
    },
    {
      seat: 1,
      steps: [
        { target: 1, darts: 4, hit: true },
        { target: 2, darts: 1, hit: false },
      ],
    },
  ],
} as AtcDetail

describe('ATC details helpers', () => {
  it('grids darts per target with tones, the ended target and targets not reached', () => {
    const g = targetGrid(detail, [1, 2, 3, 4])
    expect(g[0].cells.map(c => [c.target, c.state, c.darts, c.tone, c.skipped])).toEqual([
      [1, 'hit', 2, 2, false],
      [2, 'hit', 0, null, true],
      [3, 'ended', 5, null, false],
      [4, 'none', 0, null, false],
    ])
    expect(g[1].cells[0].tone).toBe(4)
  })

  it('fills every target in the sequence, not just the ones progress reached, when the game ended early', () => {
    const cutShort = {
      ...detail,
      sequence: [1, 2, 3, 4, 5],
      progress: [{ seat: 0, steps: [{ target: 1, darts: 1, hit: true }] }],
    } as AtcDetail
    const g = targetGrid(cutShort, cutShort.sequence)
    expect(g[0].cells.map(c => [c.target, c.state])).toEqual([
      [1, 'hit'],
      [2, 'none'],
      [3, 'none'],
      [4, 'none'],
      [5, 'none'],
    ])
  })

  it('races cumulative hits against darts', () => {
    expect(raceSeries(detail)[0].points).toEqual([
      { darts: 0, hits: 0 },
      { darts: 2, hits: 1 },
      { darts: 2, hits: 2 },
    ])
  })

  it('names each player hardest target', () => {
    const stats = [
      { index: 0, values: { hardestTarget: 11 } },
      { index: 1, values: { hardestTarget: 22 } },
      { index: 2, values: {} },
    ] as Array<{ index: number; values: Record<string, number> }>
    expect(hardestLine(stats, s => ['Christoph', 'Guest 1', 'Lena'][s])).toBe('11 cost Christoph the most; Bull cost Guest 1 the most.')
  })

  it('words the result', () => {
    expect(atcResult({ finished: 1, dartsThrown: 49 })).toBe('Finished · 49 darts')
    expect(atcResult({ finished: 0, reached: 15 })).toBe('Reached 15')
    expect(atcResult({ finished: 0, reached: 22 })).toBe('Reached Bull')
  })
})
