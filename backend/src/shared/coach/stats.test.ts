import { describe, it, expect } from 'vitest'
import { coachGame } from './index.js'
import { executionStats, missTendencies } from './stats.js'
import { dart, leg, visit } from './testLegs.js'
import { throwsOf } from './walk.js'

describe('executionStats', () => {
  it('averages the darts thrown with more than 170 left', () => {
    // 501 → 321 (180), 321 → 261 (60), 261 → 201 (60): nine darts, all with more than 170 left
    const l = leg([visit(0, 501, ['T20', 'T20', 'T20']), visit(0, 321, ['S20', 'S20', 'S20']), visit(0, 261, ['S20', 'S20', 'S20'])])
    const s = executionStats(throwsOf([l], 0, 501))
    expect(s.scoringDarts).toBe(9)
    expect(s.scoringAverage).toBeCloseTo(100, 10)
  })

  it('stops counting a dart as scoring once 170 or less is left before it', () => {
    // 261 → 201 → 141: the third dart is thrown on 141
    const s = executionStats(throwsOf([leg([visit(0, 261, ['T20', 'T20', 'S1'])])], 0, 501))
    expect(s.scoringDarts).toBe(2)
  })

  it('counts darts at a double, hits and busts', () => {
    const l = leg([visit(0, 40, ['S20', 'S19']), visit(0, 40, ['D20']), visit(0, 32, ['S16', 'D8'])])
    const s = executionStats(throwsOf([l], 0, 501))
    expect(s.busts).toBe(1)
    // On 40: S20 (at D20), then on 20 S19 busts (at D10). D20 hits. On 32: S16 (at D16), D8 hits.
    expect(s.doubles).toEqual(
      expect.arrayContaining([
        { target: 'D20', darts: 2, hits: 1 },
        { target: 'D10', darts: 1, hits: 0 },
        { target: 'D16', darts: 1, hits: 0 },
        { target: 'D8', darts: 1, hits: 1 },
      ]),
    )
    expect([s.checkouts, s.dartsAtDouble]).toEqual([2, 5])
  })

  it('counts a visit that busts on its first dart as one bust', () => {
    const s = executionStats(throwsOf([leg([visit(0, 32, ['T20', 'S16', 'D8'])])], 0, 501))
    expect(s.busts).toBe(1)
    // Only the busting dart was at D16; the S16 and D8 after it don't count
    expect(s.doubles).toEqual([{ target: 'D16', darts: 1, hits: 0 }])
    expect(s.checkouts).toBe(0)
  })

  it('gives no average, not NaN, for a seat that never threw', () => {
    const s = executionStats(throwsOf([leg([visit(1, 501, ['T20'])])], 0, 501))
    expect(s.scoringAverage).toBeNull()
    expect(s).toMatchObject({ scoringDarts: 0, busts: 0, checkouts: 0, dartsAtDouble: 0, doubles: [] })
  })
})

describe('missTendencies', () => {
  it('counts where darts at T20 went', () => {
    const l = leg([visit(0, 501, ['T20', 'S5', 'S1']), visit(0, 435, ['S20', 'S5', 'S20'])])
    const t20 = missTendencies(throwsOf([l], 0, 501)).find(t => t.aim === 'T20')!
    expect(t20).toMatchObject({ darts: 6, on: 3 })
    expect(t20.wedges).toEqual([
      { number: 5, darts: 2 },
      { number: 1, darts: 1 },
    ])
  })

  it('reads inside and outside from positions only', () => {
    // On 32 (at D16): a miss just off the board by the 16, then S16 inside the double; on 16 (at D8): S8
    const v = {
      seat: 0,
      darts: [dart('Miss', { x: -0.849, y: -0.617 }), dart('S16', { x: -0.728, y: -0.529 }), dart('S8')],
      scored: 24,
      remaining: 8,
      bust: false,
    }
    const d16 = missTendencies(throwsOf([leg([v])], 0, 501)).find(t => t.aim === 'D16')!
    expect(d16).toMatchObject({ darts: 2, positioned: 2, inside: 1, outside: 1 })
  })
})

describe('coachGame', () => {
  it('puts notes, stats and tendencies together', () => {
    const r = coachGame([leg([visit(0, 97, ['S20', 'S20', 'S20'])])], 0, 501)
    expect(r.notes.length).toBeGreaterThan(0)
    expect(r.stats.scoringDarts).toBe(0)
    expect(Array.isArray(r.tendencies)).toBe(true)
  })
})
