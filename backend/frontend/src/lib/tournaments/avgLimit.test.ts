import { describe, expect, it } from 'vitest'
import { DEFAULT_AVG_LIMIT, avgTag, droppedLine, fitsLine, fromAvgLimit, notEligibleLine, scalePercent, toAvgLimit } from './avgLimit'

const between = { min: 50, max: 70, teams: 'every', minLegs: 20, lock: true } as const

describe('toAvgLimit', () => {
  it('sends only the bounds the mode uses, and nothing when off or in person', () => {
    const on = { ...DEFAULT_AVG_LIMIT, on: true }
    expect(toAvgLimit(on, true)).toEqual({ min: 50, max: 70, teams: 'team', minLegs: 20, lock: true })
    expect(toAvgLimit({ ...on, mode: 'at_least' }, true)).toMatchObject({ min: 50, max: null })
    expect(toAvgLimit({ ...on, mode: 'at_most' }, true)).toMatchObject({ min: null, max: 70 })
    expect(toAvgLimit(DEFAULT_AVG_LIMIT, true)).toBeNull()
    expect(toAvgLimit(on, false)).toBeNull()
  })

  it('round-trips through fromAvgLimit', () => {
    for (const mode of ['between', 'at_least', 'at_most'] as const) {
      const f = { ...DEFAULT_AVG_LIMIT, on: true, mode }
      expect(toAvgLimit(fromAvgLimit(toAvgLimit(f, true)), true)).toEqual(toAvgLimit(f, true))
    }
    expect(fromAvgLimit(null)).toEqual(DEFAULT_AVG_LIMIT)
  })
})

it('avgTag reads like the Browse tags', () => {
  expect(avgTag({ ...between, min: 40, max: 65 }, 1)).toBe('Ø 40–65')
  expect(avgTag({ ...between, max: null }, 1)).toBe('Ø 50+')
  expect(avgTag({ ...between, min: null, max: 45 }, 1)).toBe('Ø up to 45')
  expect(avgTag({ ...between, min: 55, max: null, teams: 'team' }, 2)).toBe('Team Ø 55+')
  expect(avgTag({ ...between, min: 55, max: null, teams: 'every' }, 2)).toBe('Ø 55+')
})

it('notEligibleLine says why', () => {
  expect(notEligibleLine({ eligible: false, reason: 'above', average: 68.4 }, { ...between, min: null, max: 45 })).toBe(
    'Your Ø 68.4 · max 45',
  )
  expect(notEligibleLine({ eligible: false, reason: 'below', average: 41 }, between)).toBe('Your Ø 41.0 · min 50')
  expect(notEligibleLine({ eligible: false, reason: 'few_legs', average: 60 }, between)).toBe('Needs 20 legs in 30 days')
  expect(notEligibleLine({ eligible: false, reason: 'no_average', average: null }, between)).toBe('No X01 average in 30 days')
})

it('droppedLine says why a spot was taken at check-in', () => {
  expect(droppedLine('above', 72)).toBe('your 30-day average (72.0) is now above its maximum')
  expect(droppedLine('below', 41.25)).toBe('your 30-day average (41.3) is now below its minimum')
  expect(droppedLine('few_legs', 60)).toBe('you played fewer X01 legs in the last 30 days than it needs')
  expect(droppedLine('no_average', null)).toBe('you have no X01 average from the last 30 days')
})

it('fitsLine tells the organizer whether they fit, by the server’s rule', () => {
  expect(fitsLine(between, 1, { average: 68.4, legs: 40 })).toEqual({ text: 'Your 30-day average (68.4) fits', fits: true })
  expect(fitsLine(between, 1, { average: 72, legs: 40 })).toEqual({ text: 'Your 30-day average (72.0) doesn’t fit', fits: false })
  // Too few legs refuses an average in range, as the server does
  expect(fitsLine(between, 1, { average: 52, legs: 5 })).toEqual({
    text: 'You played 5 X01 legs in the last 30 days; it needs 20',
    fits: false,
  })
  expect(fitsLine({ ...between, minLegs: 0 }, 1, { average: null, legs: 0 })?.fits).toBe(false)
  expect(fitsLine({ ...between, teams: 'team' }, 2, { average: 30, legs: 40 })?.fits).toBe(true)
  expect(fitsLine(between, 1, null)).toBeNull()
})

it('scalePercent places Ø20 at the start and Ø100 at the end', () => {
  expect([scalePercent(20), scalePercent(60), scalePercent(100), scalePercent(150), scalePercent(5)]).toEqual([0, 50, 100, 100, 0])
})
