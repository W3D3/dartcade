import { describe, expect, it } from 'vitest'
import { stepDetail, stepTitle } from './describe.js'
import { suggestDifficulty } from './difficulty.js'
import { OFFICIAL_MISSIONS } from './official.js'
import { MissionSchema, StepSchema } from './types.js'

const official = (id: string) => {
  const m = OFFICIAL_MISSIONS.find(o => o.id === `official-${id}`)
  if (!m) throw new Error(id)
  return m.mission
}

describe('step titles', () => {
  it('titles the official missions as the Missions artboard does', () => {
    expect(official('tungsten-gauntlet').steps.map(stepTitle)).toEqual([
      'Check out 170 in 8 darts',
      'Hit S20 9 times in a row',
      'D11 → Bull → D6 within 9 darts',
    ])
    expect(official('around-the-clock-sprint').steps.map(stepTitle)).toEqual(['1–20 + Bull within 40 darts'])
    expect(official('bull-rush').steps.map(stepTitle)).toEqual(['Hit 5 bulls', 'Hit 2 inner bulls', 'Check out 50 in 3 darts'])
    expect(official('double-trouble-drill').steps.map(stepTitle)[0]).toBe('Hit every double once')
    expect(official('ton-machine').steps.map(stepTitle)).toEqual(['Score 100+ in 5 visits in a row', 'Keep a 60 average over 10 visits'])
    expect(official('shanghai-night').steps.map(stepTitle)[0]).toBe('S20, D20, T20 in one visit')
  })

  it('titles marks, scores and legs', () => {
    const t = (s: unknown) => stepTitle(StepSchema.parse(s))
    expect(t({ type: 'marks', targets: [20], marks: 5, per: 'total', within: 4 })).toBe('5 marks on 20 in 4 darts')
    expect(t({ type: 'marks', targets: [15, 16, 17, 18, 19, 20, 25], marks: 3, per: 'each' })).toBe('Close 15–20 + Bull')
    expect(t({ type: 'visits', compare: 'not', points: 26, visits: 10, inARow: true })).toBe('Never 26 in 10 visits in a row')
    expect(t({ type: 'score', points: 300, within: 9 })).toBe('Score 300+ within 9 darts')
    expect(t({ type: 'leg', start: 501, within: 18, finish: 'double' })).toBe('Win a 501 leg within 18 darts')
  })

  it('details a step as the builder does', () => {
    const [checkout, streak, route] = official('tungsten-gauntlet').steps
    expect(stepDetail(checkout)).toBe('Checkout · in 8 darts or fewer · double out')
    expect(stepDetail(streak)).toBe('Hit targets · a miss resets the streak')
    expect(stepDetail(route)).toBe('Hit targets · in this order · within 9 darts')
  })
})

describe('difficulty suggestion', () => {
  it('suggests Hard for the Tungsten Gauntlet, as the builder artboard does', () => {
    expect(suggestDifficulty(official('tungsten-gauntlet'))).toBe('hard')
  })

  it('easy for a relaxed step, expert for nine marks in three darts', () => {
    const m = (step: unknown, o = {}) => ({ steps: [StepSchema.parse(step)], onFail: 'retry' as const, ...o })
    expect(suggestDifficulty(m({ type: 'hit', targets: ['20'], hits: 3, inARow: false, order: 'any' }))).toBe('easy')
    expect(suggestDifficulty(m({ type: 'marks', targets: [20], marks: 9, per: 'total', within: 3 }))).toBe('expert')
  })

  it('Start over and a short limit make it harder', () => {
    const step = StepSchema.parse({ type: 'hit', targets: ['20'], hits: 3, inARow: false, order: 'any' })
    expect(suggestDifficulty({ steps: [step], onFail: 'restart', timeLimit: 300 })).toBe('hard')
  })
})

describe('the official missions', () => {
  it('are valid missions with unique ids', () => {
    for (const { mission } of OFFICIAL_MISSIONS) expect(MissionSchema.parse(mission)).toEqual(mission)
    expect(new Set(OFFICIAL_MISSIONS.map(o => o.id)).size).toBe(OFFICIAL_MISSIONS.length)
  })
})
