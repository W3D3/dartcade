import { describe, it, expect } from 'vitest'
import type { GameSummary, X01Detail } from '../api'
import { chalkboardRows, dartLabel, legSeries, legSummary, remainingTicks, x01Sides } from '../details/x01.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3) => ({
  name,
  number,
  multiplier,
  bed: (multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single') as 'Single',
})
const d = (s: ReturnType<typeof seg>, index: number) => ({
  index,
  segment: s,
  coords: null,
  source: 'manual' as const,
  corrected: false,
  thrownAt: '',
})
const T20 = seg('T20', 20, 3),
  S20 = seg('S20', 20, 1),
  D18 = seg('D18', 18, 2),
  MISS = seg('Miss', 0, 0)
const v = (visit: number, seat: number, darts: ReturnType<typeof d>[], scored: number, remaining: number, bust = false) => ({
  visit,
  seat,
  committedAt: '',
  darts,
  scored,
  remaining,
  bust,
})

const detail: X01Detail = {
  mode: 'x01',
  legs: [
    {
      leg: 0,
      starter: 0,
      winner: 0,
      visits: [
        v(0, 0, [d(T20, 0), d(T20, 1), d(T20, 2)], 180, 121),
        v(1, 1, [d(S20, 0), d(S20, 1), d(MISS, 2)], 40, 261),
        v(2, 0, [d(T20, 0), d(S20, 1), d(D18, 2)], 116, 5),
      ],
    },
  ],
}
const game = {
  players: [
    { seat: 0, name: 'Christoph' },
    { seat: 1, name: 'Guest 1' },
  ],
} as GameSummary

describe('X01 details helpers', () => {
  const sides = x01Sides(game, detail)

  it('makes one side per seat in singles', () => {
    expect(sides).toEqual([
      { key: 0, name: 'Christoph', seats: [0] },
      { key: 1, name: 'Guest 1', seats: [1] },
    ])
  })

  it('makes one side per team in a team game', () => {
    const teams = {
      ...detail,
      teams: [
        { id: 'A', name: 'Team A', seats: [0, 2] },
        { id: 'B', name: 'Team B', seats: [1, 3] },
      ],
    } as X01Detail
    expect(x01Sides(game, teams).map(s => [s.name, s.seats])).toEqual([
      ['Team A', [0, 2]],
      ['Team B', [1, 3]],
    ])
  })

  it('charts points left from the start score', () => {
    expect(legSeries(detail, 0, sides, 301).map(s => s.points.map(p => p.left))).toEqual([
      [301, 121, 5],
      [301, 261],
    ])
  })

  it('lays the chalkboard out per visit and side', () => {
    const rows = chalkboardRows(detail, 0, sides)
    expect(rows).toHaveLength(2)
    expect(rows[0].cells[0]).toMatchObject({ scored: 180, tier: 'max', darts: ['T20', 'T20', 'T20'], crossed: true, out: false })
    expect(rows[0].cells[1]).toMatchObject({ scored: 40, tier: null, darts: ['S20', 'S20', '–'], crossed: false })
    expect(rows[1].cells[0]).toMatchObject({ scored: 116, tier: 'ton', out: true, crossed: false })
    expect(rows[1].cells[1]).toBeNull()
  })

  it('sums the leg up', () => {
    expect(legSummary(detail, 0, sides, s => game.players[s].name, null)).toBe(
      'Christoph won in 6 darts, checking out T20 · S20 · D18 · Christoph threw first',
    )
    const cut = { ...detail, legs: [{ ...detail.legs[0], winner: null }] }
    expect(legSummary(cut, 0, sides, s => game.players[s].name, null)).toBe('No winner: the round limit ended it · Christoph threw first')
  })

  it('says who gave up when the unfinished leg ended in a forfeit', () => {
    const cut = { ...detail, legs: [{ ...detail.legs[0], winner: null }] }
    expect(legSummary(cut, 0, sides, s => game.players[s].name, 'Guest 1')).toBe('Not finished: Guest 1 gave up · Christoph threw first')
  })

  it('keeps remaining-chart ticks ascending, duplicate-free and no higher than the start score', () => {
    expect(remainingTicks(50)).toEqual([0, 20, 40])
    expect(remainingTicks(170)).toEqual([0, 50, 100, 150])
    expect(remainingTicks(301)).toEqual([0, 100, 200, 300])
    expect(remainingTicks(501)).toEqual([0, 100, 200, 300, 400, 500])
    expect(remainingTicks(701)).toEqual([0, 200, 400, 600])
    for (const start of [50, 170, 301, 501, 701]) {
      const ticks = remainingTicks(start)
      expect(ticks.length).toBeGreaterThanOrEqual(3)
      expect(ticks.length).toBeLessThanOrEqual(6)
      expect(ticks.every(t => t <= start)).toBe(true)
      expect(new Set(ticks).size).toBe(ticks.length)
      expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
    }
  })

  it('labels darts the way the chalkboard does', () => {
    expect([dartLabel(T20), dartLabel(seg('25', 25, 1)), dartLabel(seg('Bull', 50, 2)), dartLabel(MISS)]).toEqual([
      'T20',
      '25',
      'Bull',
      '–',
    ])
  })
})
