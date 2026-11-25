import { describe, expect, it } from 'vitest'
import { estimate } from './estimate.js'
import { OFFICIAL_MISSIONS } from './official.js'
import type { Mission } from './types.js'

const gauntlet = OFFICIAL_MISSIONS.find(m => m.id === 'official-tungsten-gauntlet')!.mission

describe('estimate', () => {
  it('puts the Tungsten Gauntlet near the artboard (6–12 min, about 60 darts)', () => {
    expect(estimate(gauntlet)).toEqual({ darts: 65, minMinutes: 7, maxMinutes: 13 })
  })

  it('never says longer than the time limit', () => {
    expect(estimate({ ...gauntlet, timeLimit: 300 }).maxMinutes).toBe(5)
  })

  it('takes harder steps as more darts', () => {
    const easy: Mission = { ...gauntlet, steps: [{ type: 'score', points: 100, within: 9 }] }
    const hard: Mission = { ...gauntlet, steps: [{ type: 'score', points: 450, within: 9 }] }
    expect(estimate(hard).darts).toBeGreaterThan(estimate(easy).darts)
  })

  it('says at least a minute and 5 darts', () => {
    const one: Mission = {
      ...gauntlet,
      timeLimit: undefined,
      steps: [{ type: 'hit', targets: ['20'], hits: 1, inARow: false, order: 'any' }],
    }
    expect(estimate(one)).toEqual({ darts: 5, minMinutes: 1, maxMinutes: 1 })
  })
})
