import { describe, it, expect } from 'vitest'
import { disconnected, seatRank, stakesLabel, upClock, type RankedState } from '../ranked/inGame.js'

const T0 = Date.parse('2026-11-04T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const seat = (over: Partial<RankedState['seats'][number]> = {}): RankedState['seats'][number] => ({
  reserveSeconds: 300,
  inReserve: false,
  disconnectForfeitAt: null,
  stakes: { win: 16, loss: 14 },
  rating: 1284,
  rankIndex: 14,
  placement: null,
  result: null,
  ...over,
})
const ranked = (over: Partial<RankedState> = {}): RankedState => ({
  now: iso(T0),
  mode: '1v1',
  visitSeconds: 120,
  reserveSeconds: 300,
  manualEntry: true,
  visitDeadline: iso(T0 + 120_000),
  forfeitAt: iso(T0 + 420_000),
  seats: [seat(), seat()],
  ...over,
})

describe('stakesLabel', () => {
  it('writes the win and the loss with their signs', () => {
    expect(stakesLabel({ win: 16, loss: 14 })).toBe('Win +16 · Loss −14')
  })
  it('is null while placing', () => {
    expect(stakesLabel(null)).toBeNull()
  })
})

describe('upClock', () => {
  it('stays hidden early in a visit', () => {
    expect(upClock(ranked(), 0, T0)).toEqual({ phase: 'hidden' })
  })
  it('counts the visit down in its last seconds', () => {
    expect(upClock(ranked(), 0, T0 + 105_000)).toEqual({ phase: 'visit', turn: '0:15' })
  })
  it('runs the reserve once the visit is over, close to the end', () => {
    expect(upClock(ranked({ visitDeadline: iso(T0 - 10_000), forfeitAt: iso(T0 + 13_000) }), 0, T0)).toMatchObject({
      phase: 'reserve',
      reserve: '0:13',
    })
  })
  it('measures against the server clock, not this one', () => {
    // This screen is two minutes behind the server: the deadline is 15 s away on the server's clock
    const skew = 120_000
    expect(upClock(ranked(), skew, T0 - skew + 105_000)).toEqual({ phase: 'visit', turn: '0:15' })
  })
})

describe('upClock without a clock', () => {
  it('is hidden when no visit clock is running', () => {
    expect(upClock(ranked({ visitDeadline: null, forfeitAt: null }), 0, T0)).toEqual({ phase: 'hidden' })
  })
})

describe('seatRank', () => {
  it('gives the rank and rating of a ranked player', () => {
    expect(seatRank(seat())).toMatchObject({ rank: { name: 'Silver V' }, rating: 1284 })
  })
  it('gives a placing player no rank and no rating', () => {
    expect(seatRank(seat({ rating: null, rankIndex: null, placement: { played: 2, of: 5 } }))).toEqual({ rank: null, rating: null })
  })
  it('gives a guest or bot nothing', () => {
    expect(seatRank(seat({ rating: null, rankIndex: null, placement: null }))).toBeNull()
  })
})

describe('disconnected', () => {
  const away = ranked({ seats: [seat(), seat({ disconnectForfeitAt: iso(T0 + 102_000) })] })
  it('finds the opponent who left, with the deadline on this screen`s clock', () => {
    expect(disconnected(away, [0], 5_000)).toEqual({ seat: 1, forfeitAt: T0 + 97_000 })
  })
  it('ignores the viewer`s own seat and games where everyone is there', () => {
    expect(disconnected(away, [1], 0)).toBeNull()
    expect(disconnected(ranked(), [0], 0)).toBeNull()
  })
})
