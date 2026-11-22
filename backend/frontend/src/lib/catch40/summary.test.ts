import { describe, it, expect } from 'vitest'
import { summaryData, snapshotStandings } from './summary.js'
import type { Catch40Detail } from '../api'
import type { Catch40Game } from '../api/game-ws'

const detail: Catch40Detail = {
  mode: 'catch40',
  seats: [
    {
      total: 6,
      tries: [
        { target: 61, darts: 2, points: 3, finish: 'D2' },
        { target: 62, darts: 3, points: 2, finish: 'D11' },
        { target: 63, darts: 5, points: 1, finish: 'D20' },
        { target: 64, darts: 6, points: 0, finish: null },
      ],
    },
  ],
}

describe('summaryData', () => {
  it('counts checkouts, average darts over made targets and targets per points', () => {
    const d = summaryData(detail, 0)
    expect(d.total).toBe(6)
    expect(d.checkouts).toEqual({ made: 3, of: 4 })
    expect(d.avgDarts).toBeCloseTo(10 / 3)
    expect(d.byPoints).toEqual([
      { points: 3, count: 1 },
      { points: 2, count: 1 },
      { points: 1, count: 1 },
      { points: 0, count: 1 },
    ])
  })
})

describe('snapshotStandings', () => {
  it('orders by the server places, ties sharing one', () => {
    const game = { seats: [{ total: 10 }, { total: 10 }, { total: 3 }] } as Catch40Game
    const players = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const results = [{ placement: 1 }, { placement: 1 }, { placement: 3 }] as never
    expect(snapshotStandings(game, players, results).map(s => [s.name, s.placement])).toEqual([
      ['A', 1],
      ['B', 1],
      ['C', 3],
    ])
  })
})
