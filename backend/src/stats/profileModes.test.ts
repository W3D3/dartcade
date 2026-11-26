import { describe, it, expect } from 'vitest'
import { profileModeStats, type SeatRow } from './profileModes.js'
import { GAME_NAMES } from '../shared/gameNames.js'

const seat = (mode: string, placement: number, seats: number, stats: Record<string, number> = {}): SeatRow => ({
  mode,
  placement,
  seats,
  stats,
})
const tile = (rows: SeatRow[], mode: string, id: string) =>
  profileModeStats(rows)
    .find(m => m.mode === mode)
    ?.tiles.find(t => t.id === id)?.value

describe('profileModeStats', () => {
  it('lists only played modes, the most played first', () => {
    const rows = [seat('atc', 1, 1), seat('x01', 1, 2), seat('x01', 2, 2), seat('x01', 1, 2)]
    expect(profileModeStats(rows).map(m => [m.mode, m.games])).toEqual([
      ['x01', 3],
      ['atc', 1],
    ])
    expect(profileModeStats([])).toEqual([])
  })

  it('weighs the X01 average by darts and rates checkouts', () => {
    const rows = [
      seat('x01', 1, 2, { pointsScored: 501, dartsThrown: 30, count180: 1, bestCheckout: 64, checkoutAttempts: 2, checkoutHits: 1 }),
      seat('x01', 2, 2, { pointsScored: 100, dartsThrown: 30, bestCheckout: 120, checkoutAttempts: 2, checkoutHits: 0 }),
    ]
    expect(tile(rows, 'x01', 'average')).toBeCloseTo((601 / 60) * 3)
    expect(tile(rows, 'x01', 'count180')).toBe(1)
    expect(tile(rows, 'x01', 'bestCheckout')).toBe(120)
    expect(tile(rows, 'x01', 'checkoutRate')).toBe(0.25)
    expect(tile(rows, 'x01', 'winRate')).toBe(0.5)
  })

  it('leaves out wins for solo games and stats nothing recorded', () => {
    const rows = [seat('catch40', 1, 1, { total: 60, checkouts: 2 }), seat('catch40', 1, 1, { total: 30, checkouts: 1 })]
    const [m] = profileModeStats(rows)
    expect(m.tiles.map(t => t.id)).toEqual(['bestTotal', 'averageTotal', 'checkouts'])
    expect(tile(rows, 'catch40', 'averageTotal')).toBe(45)
    // ATC without a finished run has no fewest-darts tile
    const atc = profileModeStats([seat('atc', 2, 2, { dartsThrown: 30, targetsHit: 10 })])[0]
    expect(atc.tiles.map(t => t.id)).toEqual(['wins', 'winRate', 'completed', 'dartsPerNumber'])
  })

  it('falls back to wins for a mode without definitions', () => {
    expect(profileModeStats([seat('newmode', 1, 2)])[0].tiles.map(t => t.id)).toEqual(['wins', 'winRate'])
  })

  it('spells every tile label out, without the abbreviations players do not know', () => {
    const every = Object.fromEntries(
      [
        'pointsScored',
        'dartsThrown',
        'count180',
        'bestCheckout',
        'checkoutAttempts',
        'checkoutHits',
        'marksScored',
        'mpr',
        'targetsHit',
        'dartsToFinish',
        'highestMade',
        'checkouts',
        'tries',
        'bestRun',
        'visits',
        'highestSet',
        'livesLostBetween',
        'livesLostMiss',
        'holesInOne',
        'toPar',
        'total',
        'shanghais',
      ].map(k => [k, 3]),
    )
    const banned = /\b(ATC|P121|HiLo|3DA|MPR|F9|CO%|HC|avg)\b|%/
    for (const mode of Object.keys(GAME_NAMES).filter(m => m !== 'mission')) {
      const [block] = profileModeStats([seat(mode, 1, 2, every)])
      expect(block.tiles.length, mode).toBeGreaterThan(1)
      for (const t of block.tiles) expect(t.label, `${mode} ${t.id}`).not.toMatch(banned)
    }
  })
})
