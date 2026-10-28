import { describe, it, expect } from 'vitest'
import { bestRunLine, snapshotStandings, summaryData } from './summary.js'
import type { P121Detail } from '../api'
import type { P121Game } from '../api/game-ws'

type Try = P121Detail['seats'][number]['tries'][number]
const made = (target: number, darts: number, finish: string): Try => ({ target, made: true, darts, finish })
const miss = (target: number): Try => ({ target, made: false, darts: 9, finish: null })

// The P121-Summary artboard: 10 tries, 7 made, a run of 4 from 121 to 124, then 125 missed
const tries: Try[] = [
  miss(121),
  made(121, 6, 'D12'),
  made(122, 8, 'D16'),
  miss(123),
  made(121, 5, 'D8'),
  made(122, 6, 'D12'),
  made(123, 8, 'D16'),
  made(124, 7, 'D12'),
  miss(125),
  made(121, 9, 'D20'),
]
const detail: P121Detail = {
  mode: 'p121',
  seats: [
    {
      tries,
      doubles: [
        { label: 'D12', hits: 3, attempts: 5 },
        { label: 'Bull', hits: 0, attempts: 1 },
      ],
      dartsPerCheckout: [
        { darts: 5, count: 1 },
        { darts: 6, count: 2 },
        { darts: 7, count: 1 },
        { darts: 8, count: 2 },
        { darts: 9, count: 1 },
      ],
      bestRun: { length: 4, from: 121, to: 124 },
      highestReached: 125,
      fastest: { darts: 5, target: 121 },
    },
  ],
}

describe('summaryData', () => {
  it('shapes the artboard session', () => {
    const d = summaryData(detail, 0)
    expect(d.reached).toBe(125)
    expect(d.bestRun).toEqual({ length: 4, from: 121, to: 124 })
    expect(d.checkouts).toEqual({ made: 7, tries: 10, pct: 70 })
    expect(d.highestMade).toBe(124)
    expect(d.avgDarts).toBe(7)
    expect(d.fastest).toEqual({ darts: 5, target: 121 })
    expect(d.tries.map(t => t.made)).toEqual([false, true, true, false, true, true, true, true, false, true])
    expect(d.tries[8]).toEqual({ target: 125, made: false })
    expect(d.doubles).toEqual(detail.seats[0].doubles)
  })

  it('fills the darts per checkout from 3 up to the most used, zeros included', () => {
    expect(summaryData(detail, 0).dartsPerCheckout).toEqual([
      { darts: 3, count: 0 },
      { darts: 4, count: 0 },
      { darts: 5, count: 1 },
      { darts: 6, count: 2 },
      { darts: 7, count: 1 },
      { darts: 8, count: 2 },
      { darts: 9, count: 1 },
    ])
  })

  it('starts the darts per checkout lower when a checkout took fewer than 3 (81 or 101)', () => {
    const seat = {
      ...detail.seats[0],
      dartsPerCheckout: [
        { darts: 2, count: 1 },
        { darts: 4, count: 1 },
      ],
    }
    expect(summaryData({ ...detail, seats: [seat] }, 0).dartsPerCheckout).toEqual([
      { darts: 2, count: 1 },
      { darts: 3, count: 0 },
      { darts: 4, count: 1 },
    ])
  })

  it('has no averages without a checkout', () => {
    const none: P121Detail = {
      mode: 'p121',
      seats: [{ tries: [miss(121)], doubles: [], dartsPerCheckout: [], bestRun: null, highestReached: 121, fastest: null }],
    }
    const d = summaryData(none, 0)
    expect(d.checkouts).toEqual({ made: 0, tries: 1, pct: 0 })
    expect(d.highestMade).toBeNull()
    expect(d.avgDarts).toBeNull()
    expect(d.dartsPerCheckout).toEqual([])
  })
})

describe('bestRunLine', () => {
  const d = summaryData(detail, 0)
  it('names the run and what a miss does under each rule', () => {
    expect(bestRunLine(d, 'reset', 121)).toBe('Best run: 4 checkouts in a row, 121 → 124 · a miss sends you back to 121')
    expect(bestRunLine(d, 'down', 121)).toBe('Best run: 4 checkouts in a row, 121 → 124 · a miss drops you one')
    expect(bestRunLine(d, 'stay', 121)).toBe('Best run: 4 checkouts in a row, 121 → 124 · a miss keeps the target')
  })

  it('says one checkout, and none', () => {
    expect(bestRunLine({ ...d, bestRun: { length: 1, from: 121, to: 121 } }, 'stay', 121)).toBe(
      'Best run: 1 checkout, 121 · a miss keeps the target',
    )
    expect(bestRunLine({ ...d, bestRun: null }, 'reset', 121)).toBe('No checkouts this time · a miss sends you back to 121')
  })
})

describe('snapshotStandings', () => {
  type Seat = P121Game['seats'][number]
  const seat = (t: Try[]): Seat => {
    const m = t.filter(x => x.made)
    return {
      target: 121,
      left: 121,
      darts: 0,
      visits: [],
      floor: 121,
      tries: t,
      made: m.length,
      highestMade: m.length ? Math.max(...m.map(x => x.target)) : null,
      avgDarts: null,
      done: true,
    }
  }
  const game = (seats: Seat[], winner: number) => ({ seats, winner }) as unknown as P121Game

  const three = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
  const g = game([seat([made(121, 4, 'D8'), made(122, 4, 'D8')]), seat([made(121, 9, 'D20')]), seat([miss(121)])], 1)

  // The ranking itself is the server's (p121.ts summarize, forfeits via results()); this only orders by it
  it("orders by the server's places, ties in seat order", () => {
    const results = [
      { placement: 2, forfeited: true },
      { placement: 1, forfeited: false },
      { placement: 2, forfeited: true },
    ]
    expect(snapshotStandings(g, three, results)).toEqual([
      { name: 'B', placement: 1, highestMade: 121 },
      { name: 'A', placement: 2, highestMade: 122 },
      { name: 'C', placement: 2, highestMade: null },
    ])
  })
})
