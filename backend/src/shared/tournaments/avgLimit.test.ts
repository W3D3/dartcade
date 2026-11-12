import { describe, expect, it } from 'vitest'
import { entryEligibility, keepsSpot, viewerEligibility, type AvgLimit } from './avgLimit.js'

const between: AvgLimit = { min: 50, max: 70, teams: 'every', minLegs: 20, lock: true }
const atLeast: AvgLimit = { ...between, max: null }
const atMost: AvgLimit = { ...between, min: null, max: 45 }
const p = (average: number | null, legs = 40) => ({ average, legs })

describe('entryEligibility', () => {
  it('between: inside the range, its ends included', () => {
    expect(entryEligibility(between, [p(50)]).eligible).toBe(true)
    expect(entryEligibility(between, [p(70)]).eligible).toBe(true)
    expect(entryEligibility(between, [p(49.9)])).toEqual({ eligible: false, reason: 'below', average: 49.9 })
    expect(entryEligibility(between, [p(70.1)])).toEqual({ eligible: false, reason: 'above', average: 70.1 })
  })

  it('at least: no upper bound', () => {
    expect(entryEligibility(atLeast, [p(120)]).eligible).toBe(true)
    expect(entryEligibility(atLeast, [p(48)]).reason).toBe('below')
  })

  it('at most: no lower bound', () => {
    expect(entryEligibility(atMost, [p(21)]).eligible).toBe(true)
    expect(entryEligibility(atMost, [p(68.4)])).toEqual({ eligible: false, reason: 'above', average: 68.4 })
  })

  it('refuses a player with too few legs, whatever the average', () => {
    expect(entryEligibility(between, [p(60, 19)])).toEqual({ eligible: false, reason: 'few_legs', average: null })
    expect(entryEligibility(between, [p(60, 20)]).eligible).toBe(true)
  })

  it('refuses a player without an X01 average', () => {
    expect(entryEligibility({ ...between, minLegs: 0 }, [p(null, 0)]).reason).toBe('no_average')
  })

  it('every player: each one in range, the first out of range named', () => {
    expect(entryEligibility(between, [p(55), p(65)]).eligible).toBe(true)
    expect(entryEligibility(between, [p(55), p(41.2)])).toEqual({ eligible: false, reason: 'below', average: 41.2 })
  })

  it('team average: the mean of the picked players, one may be outside', () => {
    const team: AvgLimit = { ...atLeast, min: 55, teams: 'team' }
    expect(entryEligibility(team, [p(68.4), p(41.2)])).toEqual({ eligible: false, reason: 'below', average: 54.8 })
    expect(entryEligibility(team, [p(68.4), p(61.2)])).toEqual({ eligible: true, reason: null, average: 64.8 })
  })
})

describe('viewerEligibility', () => {
  it('solo: the player’s own average', () => {
    expect(viewerEligibility(atMost, 1, p(68.4))).toEqual({ eligible: false, reason: 'above', average: 68.4 })
  })

  it('team average: only the legs, since teammates move the mean', () => {
    const team: AvgLimit = { ...atLeast, teams: 'team' }
    expect(viewerEligibility(team, 2, p(30)).eligible).toBe(true)
    expect(viewerEligibility(team, 2, p(30, 3))).toEqual({ eligible: false, reason: 'few_legs', average: 30 })
  })

  it('every player in a team tournament: their own average', () => {
    expect(viewerEligibility(between, 2, p(30)).reason).toBe('below')
  })

  it('shows the average even when the legs are short', () => {
    expect(viewerEligibility(between, 1, p(60, 2))).toEqual({ eligible: false, reason: 'few_legs', average: 60 })
  })
})

describe('keepsSpot', () => {
  const out = entryEligibility(between, [p(75)])
  it('drops an entry that moved out of range only when the limit is unlocked', () => {
    expect(keepsSpot({ ...between, lock: true }, out)).toBe(true)
    expect(keepsSpot({ ...between, lock: false }, out)).toBe(false)
    expect(keepsSpot({ ...between, lock: false }, entryEligibility(between, [p(60)]))).toBe(true)
    expect(keepsSpot(null, out)).toBe(true)
  })
})
