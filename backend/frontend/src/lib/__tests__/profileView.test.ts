import { describe, it, expect } from 'vitest'
import { relationLabel, x01Averages } from '../profile/view'
import type { GameStats } from '$lib/api'

const agg = (over: Partial<GameStats['modes']['x01']['stats'][string]> = {}) => ({
  avg: 0,
  min: 0,
  max: 0,
  sum: 0,
  previousAvg: null,
  ...over,
})

const stats = (over: GameStats['modes']['x01']['stats'] = {}): GameStats => ({
  days: 30,
  matches: 1,
  wins: 1,
  contested: 1,
  modes: { x01: { matches: 1, wins: 1, contested: 1, stats: over } },
})

describe('profile view', () => {
  it('no stats without an x01 mode', () => {
    expect(x01Averages(null)).toBeNull()
    expect(x01Averages({ days: 30, matches: 0, wins: 0, contested: 0, modes: {} })).toBeNull()
  })

  it('averages, checkout %, and an improving trend', () => {
    const a = x01Averages(
      stats({
        average: agg({ avg: 58.4, previousAvg: 52.1 }),
        first9Average: agg({ avg: 61 }),
        checkoutHits: agg({ sum: 3 }),
        checkoutAttempts: agg({ sum: 10 }),
        count180: agg({ sum: 4 }),
        bestLegDarts: agg({ min: 15 }),
      }),
    )
    expect(a).toEqual({
      average: '58.4',
      trend: { text: '6.3 vs last month', up: true },
      first9: '61.0',
      checkoutPct: '30%',
      count180: 4,
      bestLeg: 15,
    })
  })

  it('a worsening trend, and nulls without the underlying stat', () => {
    const a = x01Averages(stats({ average: agg({ avg: 40, previousAvg: 50 }) }))
    expect(a?.trend).toEqual({ text: '10.0 vs last month', up: false })
    expect(a?.checkoutPct).toBeNull()
    expect(a?.count180).toBeNull()
    expect(a?.bestLeg).toBeNull()
  })

  it('no trend and no checkout % without games the period before, or without attempts', () => {
    const a = x01Averages(stats({ average: agg({ avg: 40 }), checkoutAttempts: agg({ sum: 0 }) }))
    expect(a?.trend).toBeNull()
    expect(a?.checkoutPct).toBeNull()
  })

  it('names each relation', () => {
    expect(relationLabel({ kind: 'self', requestId: null })).toBe('You')
    expect(relationLabel({ kind: 'friend', requestId: null })).toBe('Friend')
    expect(relationLabel({ kind: 'incoming', requestId: 'r1' })).toBe('Wants to be friends')
    expect(relationLabel({ kind: 'outgoing', requestId: 'r1' })).toBe('Request sent')
    expect(relationLabel({ kind: 'none', requestId: null })).toBe('')
  })
})
