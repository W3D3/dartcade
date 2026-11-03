import { describe, it, expect } from 'vitest'
import { evaluator, nextVisit } from './model.js'
import { throwEvaluations } from './notes.js'
import { leg, visit } from './testLegs.js'
import { dartDeltas, visitValues } from './value.js'
import { throwsOf } from './walk.js'

/** Seat 0's visit from `start`, the opponent (seat 1) on `opponentLeft` */
function values(start: number, names: string[], opponentLeft = 501) {
  const throws = throwsOf([leg([visit(1, opponentLeft, []), visit(0, start, names)])], 0, 501)
  const evaluate = throwEvaluations()
  return { throws, v: visitValues(throws, evaluate), deltas: dartDeltas(throws, evaluate) }
}
const best = (start: number, w: number, left: number, darts: number) => Math.max(...evaluator(start, w)(left, darts).values)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('visit values', () => {
  it('start with the best aim from the visit start and telescope to the end', () => {
    const { throws, v, deltas } = values(59, ['Miss', 'S3', 'S19'], 60)
    const w = throws[0].w
    expect(w).toBeLessThan(1)
    expect(v[0]).toBeCloseTo(best(59, w, 59, 3))
    expect(v).toHaveLength(4)
    // No dart left: the next visit's chance, weighted by w
    expect(v[3]).toBeCloseTo(w * nextVisit(37))
    expect(sum(deltas)).toBeCloseTo((v[3] - v[0]) * 100)
  })

  it('is 1 after a checkout', () => {
    const { v, deltas } = values(32, ['Miss', 'D16'])
    expect(v.at(-1)).toBe(1)
    expect(sum(deltas)).toBeCloseTo((1 - best(32, 1, 32, 3)) * 100)
  })

  it("goes back to the start's next visit after a bust", () => {
    const { v } = values(20, ['S10', 'S7', 'S5'])
    expect(v.at(-1)).toBeCloseTo(nextVisit(20))
  })

  it('goes on with the next dart in a visit still in progress', () => {
    const { v } = values(100, ['S20'])
    expect(v).toEqual([best(100, 1, 100, 3), best(100, 1, 80, 2)])
  })

  it('a best-aimed hit on the double is worth more than a miss', () => {
    expect(values(40, ['D20']).deltas[0]).toBeGreaterThan(0)
    expect(values(40, ['Miss']).deltas[0]).toBeLessThan(0)
  })
})
