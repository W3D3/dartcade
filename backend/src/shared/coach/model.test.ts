import { describe, it, expect } from 'vitest'
import { AIMS } from './aims.js'
import { loadModel } from './model.js'
import { suggestedTier, targetTier } from './tiers.js'
import { REF } from './testLegs.js'

const { evaluator, fin, nextVisit } = REF

const BOGEYS = [159, 162, 163, 165, 166, 168, 169]

describe('the finish table', () => {
  it("has no chance on the bogey numbers, or with one dart on what one dart can't finish", () => {
    for (const r of BOGEYS) expect(fin[r][3]).toBe(0)
    for (const r of [41, 57, 99, 3]) expect(fin[r][1]).toBe(0)
    expect(fin[1][3]).toBe(0)
  })

  it('never gets worse with more darts', () => {
    for (let r = 2; r <= 170; r++) {
      expect(fin[r][2]).toBeGreaterThanOrEqual(fin[r][1])
      expect(fin[r][3]).toBeGreaterThanOrEqual(fin[r][2])
    }
  })

  it('finishes 40 more often than 99, and 170 least of the big ones', () => {
    expect(fin[40][3]).toBeGreaterThan(fin[99][3])
    expect(fin[99][3]).toBeGreaterThan(fin[170][3])
    expect(fin[170][3]).toBeGreaterThan(0)
  })

  it('gives nothing for a next visit outside 2–170', () => {
    expect([nextVisit(1), nextVisit(0), nextVisit(171), nextVisit(501)]).toEqual([0, 0, 0, 0])
    expect(nextVisit(40)).toBe(fin[40][3])
  })
})

describe('the evaluator', () => {
  it('values every aim between 0 and 1', () => {
    const ev = evaluator(99, 1)(99, 3)
    expect(ev.values).toHaveLength(AIMS.length)
    for (const v of ev.values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('makes a last dart worthless when there is no next visit and no one-dart finish', () => {
    const ev = evaluator(57, 0)(57, 1)
    expect(Math.max(...ev.values)).toBe(0)
  })

  it('prefers D20 on 40 with three darts', () => {
    const ev = evaluator(40, 1)(40, 3)
    const best = ev.values.indexOf(Math.max(...ev.values))
    expect(AIMS[best].id).toBe('D20')
  })

  it('explains an aim through its outcomes: a dart in 20 busts on 7', () => {
    const ev = evaluator(7, 1)(7, 3)
    const t20 = AIMS.findIndex(a => a.id === 'T20')
    const outs = ev.outcomes(t20)
    expect(outs.find(o => o.outcome[0] === 'T20')?.after).toBe('bust')
    expect(outs.find(o => o.outcome[0] === 'S1')?.after).toBe(6)
    // The outcomes' values, weighted by their chances, add up to the aim's value
    const sum = outs.reduce((s, o) => s + o.outcome[3] * o.value, 0)
    expect(sum).toBeCloseTo(ev.values[t20], 10)
  })
})

describe('the coaching tier', () => {
  it('is the tier the average reached exactly, else the next one up; world class above it all, intermediate without one', () => {
    expect([0, 30, 30.1, 45, 52, 60, 60.1, 75, 89.9, 90, 104, 105, 140].map(suggestedTier)).toEqual([
      'beginner',
      'beginner',
      'pub',
      'pub',
      'intermediate',
      'intermediate',
      'semipro',
      'semipro',
      'pro',
      'pro',
      'worldclass',
      'worldclass',
      'worldclass',
    ])
    expect([null, undefined, NaN].map(suggestedTier)).toEqual(['intermediate', 'intermediate', 'intermediate'])
  })

  it("is the player's pick, or the suggestion on auto", () => {
    expect(targetTier('pro', 40)).toBe('pro')
    expect(targetTier('auto', 40)).toBe('pub')
    expect(targetTier(undefined, null)).toBe('intermediate')
    expect(targetTier('level7', 52)).toBe('intermediate')
  })

  it('loads each tier once, and semi-pro is the tests’ reference', async () => {
    const m = await loadModel('semipro')
    expect(await loadModel('semipro')).toBe(m)
    expect(m.tier).toBe('semipro')
    expect(m.fin).toEqual(REF.fin)
    await expect(loadModel('level7' as never)).rejects.toThrow()
  })

  it('gives a better player a better chance from every finish', async () => {
    const [low, high] = await Promise.all([loadModel('pub'), loadModel('pro')])
    for (const r of [40, 60, 100, 121, 170]) expect(high.nextVisit(r)).toBeGreaterThan(low.nextVisit(r))
  })
})
