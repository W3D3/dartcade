import { describe, it, expect } from 'vitest'
import { segmentAt } from '../board.js'
import { AIMS } from './aims.js'
import { LANDING, LANDING_LEVEL } from './landing.gen.js'

describe('the aim points', () => {
  it('has a treble, double, two singles and a wire per number, plus the bull and 25', () => {
    expect(AIMS).toHaveLength(102)
    expect(new Set(AIMS.map(a => a.id)).size).toBe(102)
  })

  it('puts every bed aim inside its own bed', () => {
    for (const a of AIMS.filter(a => !a.id.startsWith('W'))) {
      const s = segmentAt(a.x, a.y)
      const expected = a.id === 'Bull' ? 'Bull' : a.id === '25' ? '25' : a.label
      expect({ id: a.id, landed: s.name }).toEqual({ id: a.id, landed: expected })
    }
  })

  it('puts each wire between the two numbers it names', () => {
    const w = AIMS.find(a => a.id === 'W20-1')!
    expect(w.numbers).toEqual([20, 1])
    // A hair either side of the wire lands in each of its numbers
    const a = Math.atan2(w.y, w.x)
    const r = Math.hypot(w.x, w.y)
    const at = (da: number) => segmentAt(r * Math.cos(a + da), r * Math.sin(a + da)).number
    expect([at(0.01), at(-0.01)]).toEqual([20, 1])
  })
})

describe('the landing table', () => {
  it('is for the reference player, one row per aim', () => {
    expect(LANDING_LEVEL).toBe(7)
    expect(LANDING).toHaveLength(AIMS.length)
  })

  it("sums each aim's chances to 1, give or take the dropped tail", () => {
    for (const outs of LANDING) {
      const sum = outs.reduce((s, o) => s + o[3], 0)
      expect(sum).toBeGreaterThan(0.98)
      expect(sum).toBeLessThanOrEqual(1.00001)
    }
  })

  it('hits T20 about a third of the time, as an 81-average player does', () => {
    const t20 = LANDING[AIMS.findIndex(a => a.id === 'T20')]
    const hit = t20.find(o => o[0] === 'T20')![3]
    expect(hit).toBeGreaterThan(0.28)
    expect(hit).toBeLessThan(0.42)
  })

  it('scores and marks doubles like the game', () => {
    const all = LANDING.flat()
    // toMatchObject requires equal array length, so compare name/points/double without the
    // probability (vitest 2.1.9: see aims.test.ts findings in task-1-report.md)
    const nameable = (name: string) => all.find(o => o[0] === name)?.slice(0, 3)
    expect(nameable('Bull')).toEqual(['Bull', 50, true])
    expect(nameable('25')).toEqual(['25', 25, false])
    expect(nameable('D16')).toEqual(['D16', 32, true])
    expect(nameable('T19')).toEqual(['T19', 57, false])
    expect(nameable('Miss')).toEqual(['Miss', 0, false])
  })
})
