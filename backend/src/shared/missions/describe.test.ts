import { describe, expect, it } from 'vitest'
import { stepDetail, stepTitle } from './describe.js'
import { suggestDifficulty } from './difficulty.js'
import { GAUNTLET } from './fixtures.js'
import { StepSchema } from './types.js'

describe('step titles', () => {
  it('titles a mission as the Missions artboard does', () => {
    expect(GAUNTLET.steps.map(stepTitle)).toEqual([
      'Check out 170 in 8 darts',
      'Hit S20 9 times in a row',
      'D11 → Bull → D6 within 9 darts',
    ])
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
    const [checkout, streak, route] = GAUNTLET.steps
    expect(stepDetail(checkout)).toBe('Checkout · in 8 darts or fewer · double out')
    expect(stepDetail(streak)).toBe('Hit targets · a miss resets the streak')
    expect(stepDetail(route)).toBe('Hit targets · in this order · within 9 darts')
  })
})

describe('difficulty suggestion', () => {
  it('suggests Hard for the Tungsten Gauntlet, as the builder artboard does', () => {
    expect(suggestDifficulty(GAUNTLET)).toBe('hard')
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
