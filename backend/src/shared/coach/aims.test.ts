import { describe, it, expect } from 'vitest'
import { segmentAt } from '../board.js'
import { AIMS, aimById, aimPoints, aimsOn, bedAim, neighbours } from './aims.js'
import { LANDING } from './landing/semipro.gen.js'
import { loadModel } from './model.js'
import { COACH_TIER_IDS } from './tiers.js'

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
  it("has one row per aim at every tier, each aim's chances summing to 1 give or take the dropped tail", async () => {
    for (const tier of COACH_TIER_IDS) {
      const { landing } = await loadModel(tier)
      expect(landing).toHaveLength(AIMS.length)
      for (const outs of landing) {
        const sum = outs.reduce((s, o) => s + o[3], 0)
        expect(sum).toBeGreaterThan(0.97)
        // Each chance is rounded to 1e-5, so many small ones can add up past 1
        expect(sum).toBeLessThanOrEqual(1.001)
      }
    }
  })

  it('hits T20 about a third of the time, as a semi-pro (75 average) does', () => {
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

describe('aimPoints', () => {
  it('scores each aim where it is aimed, both numbers of a wire', () => {
    const at = (id: string) => aimPoints(aimById(id)!)
    expect(['T20', 'D16', 'SO5', 'W20-1', 'Bull', '25'].map(at)).toEqual([[60], [32], [5], [20, 1], [50], [25]])
  })
})

describe('bedAim', () => {
  it('sits in the named bed', () => {
    for (const name of ['T20', 'D3', 'S11', 'Bull', '25']) {
      const c = bedAim(name)!
      expect(segmentAt(c.x, c.y).name, name).toBe(name)
    }
  })
  it('has none off the board', () => {
    expect(bedAim('Miss')).toBeNull()
    expect(bedAim('M20')).toBeNull()
  })
})

describe('aimsOn', () => {
  it('are every aim on the numbers, wires included', () => {
    const ids = aimsOn([20, ...neighbours(20)])
      .map(i => AIMS[i].id)
      .sort()
    const on = (n: number) => [`T${n}`, `D${n}`, `SO${n}`, `SI${n}`]
    expect(ids).toEqual([...on(5), ...on(20), ...on(1), 'W12-5', 'W5-20', 'W20-1', 'W1-18'].sort())
    expect(
      aimsOn([25])
        .map(i => AIMS[i].id)
        .sort(),
    ).toEqual(['25', 'Bull'])
    expect(neighbours(25)).toEqual([])
  })
})
