import { describe, it, expect } from 'vitest'
import { executionStats } from './stats.js'
import { leg, visit } from './testLegs.js'
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
