import { describe, it, expect } from 'vitest'
import { rankedOutcome } from '../ranked/result.js'
import type { RankedState } from '../ranked/inGame.js'

type Seat = RankedState['seats'][number]
const seat = (over: Partial<Seat> = {}): Seat => ({
  reserveSeconds: 300,
  inReserve: false,
  disconnectForfeitAt: null,
  stakes: { win: 17, loss: 13 },
  rating: 1293,
  rankIndex: 14,
  placement: null,
  result: { change: 17, rankIndexBefore: 14, rankIndexAfter: 15 },
  ...over,
})
const ranked = (mine: Seat, theirs: Seat = seat({ rating: 1301, rankIndex: 15, result: null })): RankedState => ({
  now: '2026-11-04T12:00:00Z',
  mode: '1v1',
  visitSeconds: 120,
  reserveSeconds: 300,
  manualEntry: true,
  visitDeadline: null,
  forfeitAt: null,
  seats: [mine, theirs],
})

describe('rankedOutcome', () => {
  it('is null until the server recorded the result', () => {
    expect(rankedOutcome(ranked(seat({ result: null })), 0, true)).toBeNull()
  })

  it('says what a win moved and promotes when the stage went up', () => {
    const o = rankedOutcome(ranked(seat()), 0, true)!
    expect(o).toMatchObject({ change: '+17 RP', before: 1293, after: 1310, moved: 'promoted', placing: null })
    expect(o.rankBefore?.name).toBe('Silver V')
    expect(o.rankAfter?.name).toBe('Gold I')
    expect(o.progress).toEqual({ pct: 20, line: '40 RP to Gold II' })
    expect(o.opponent).toMatchObject({ seat: 1, rating: 1301, rank: { name: 'Gold I' } })
  })

  it('shows no move when the stage held, and a minus sign on a loss', () => {
    const o = rankedOutcome(
      ranked(seat({ rating: 1384, rankIndex: 16, result: { change: -14, rankIndexBefore: 16, rankIndexAfter: 16 } })),
      0,
      false,
    )!
    expect(o).toMatchObject({ change: '−14 RP', after: 1370, moved: null, won: false })
  })

  it('counts the placement match and hides the rating', () => {
    const o = rankedOutcome(
      ranked(
        seat({
          rating: null,
          rankIndex: null,
          placement: { played: 2, of: 5 },
          result: { change: null, rankIndexBefore: null, rankIndexAfter: null },
        }),
      ),
      0,
      true,
    )!
    expect(o).toMatchObject({
      change: null,
      before: null,
      after: null,
      rankAfter: null,
      moved: null,
      placing: { played: 3, of: 5 },
      progress: null,
    })
  })

  it('reveals the rank on the match that finishes placing', () => {
    const o = rankedOutcome(
      ranked(
        seat({
          rating: null,
          rankIndex: null,
          placement: { played: 4, of: 5 },
          result: { change: null, rankIndexBefore: null, rankIndexAfter: 9 },
        }),
      ),
      0,
      true,
    )!
    expect(o).toMatchObject({ change: null, placing: null, moved: null })
    expect(o.rankAfter?.name).toBe('Bronze V')
  })
})
