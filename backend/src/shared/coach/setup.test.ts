import { describe, expect, it } from 'vitest'
import { setupModel } from '../../bots/setupModel.js'
import { minDarts } from './minDarts.js'
import { loadModel } from './model.js'
import { setupAim } from './setup.js'
import { COACH_TIER_IDS } from './tiers.js'

const model = setupModel()
const aimAt = (left: number, darts = 1) => {
  const s = setupAim(model, left, darts)
  return s && [s.aim.label, s.leaves]
}

describe('setupAim', () => {
  it('sets up a double with the last dart', () => {
    expect(aimAt(47)).toEqual(['S15', 32])
    expect(aimAt(59)).toEqual(['S19', 40])
    expect(aimAt(41)).toEqual(['S17', 24])
    expect(aimAt(39)).toEqual(['S15', 24])
    expect(aimAt(35)).toEqual(['S3', 32])
  })

  it('leaves a 40 or so from a high score', () => {
    expect(aimAt(100)).toEqual(['T20', 40])
    expect(aimAt(103)).toEqual(['T19', 46])
  })

  it('goes for the safest leave from beyond 170, and for the checkout range from 171', () => {
    expect(aimAt(171)).toEqual(['T20', 111])
    expect(aimAt(230)).toEqual(['T20', 170])
  })

  it('has no setup for a scoring dart: more than 170 left, or more than 230 on the last dart', () => {
    expect(setupAim(model, 231, 1)).toBeNull()
    expect(setupAim(model, 171, 2)).toBeNull()
    expect(setupAim(model, 501, 3)).toBeNull()
  })

  it('has none where no score is left to set up, or for no darts', () => {
    expect(setupAim(model, 1, 1)).toBeNull()
    expect(setupAim(model, 47, 0)).toBeNull()
  })

  it('also sets up with the second dart', () => {
    expect(aimAt(169, 3)).toEqual(['T19', 112])
  })

  it('never aims at a wire, and never at a dart that busts', () => {
    for (let left = 2; left <= 230; left++)
      for (const darts of [1, 2, 3]) {
        const s = setupAim(model, left, darts)
        if (!s) continue
        expect(s.aim.id).not.toMatch(/^W/)
        expect(s.leaves === null || s.leaves >= 2).toBe(true)
      }
  })

  it('leaves a score that can be finished whenever the last dart can', () => {
    // Every score from 41 to 170 has a one-dart setup that leaves a score three darts can finish
    for (let left = 41; left <= 170; left++) {
      const s = setupAim(model, left, 1)
      expect(s?.leaves, `${left}`).not.toBeNull()
      expect(minDarts(s?.leaves ?? 0), `${left} → ${s?.leaves}`).toBeLessThanOrEqual(3)
    }
  })
})

describe('setupAim: the bull and the 25', () => {
  it('names the 25 to leave 40 from 65 with one dart, at every tier', async () => {
    for (const tier of COACH_TIER_IDS) {
      const s = setupAim(await loadModel(tier), 65, 1)
      expect([tier, s?.label, s?.leaves]).toEqual([tier, '25', 40])
    }
  })

  it('names the bull when the 50 is the bed worth more: 82 with one dart leaves D16', async () => {
    const s = setupAim(await loadModel('semipro'), 82, 1)
    expect([s?.label, s?.leaves]).toEqual(['Bull', 32])
  })
})
