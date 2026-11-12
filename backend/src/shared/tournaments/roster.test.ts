import { describe, expect, it } from 'vitest'
import type { AvgLimit } from './avgLimit.js'
import { pickProblem, rosterComplete, slotsOf, waitingFor, type Candidate, type RosterSlot } from './roster.js'

const limit: AvgLimit = { min: 55, max: null, teams: 'team', minLegs: 0, lock: true }
const t = (avgLimit: AvgLimit | null = null, manualScoring = false) => ({
  teamSize: 2,
  settings: { registrationClosesMinutes: null, manualScoring, avgLimit },
})
const player = (userId: string, average: number | null, more: Partial<Candidate> = {}): Candidate => ({
  userId,
  form: { average, legs: 30 },
  hasBoard: true,
  taken: false,
  ...more,
})

describe('pickProblem', () => {
  it('takes exactly teamSize different players', () => {
    expect(pickProblem(t(), [player('c', 60)]).problem).toBe('count')
    expect(pickProblem(t(), [player('c', 60), player('c', 60)]).problem).toBe('count')
    expect(pickProblem(t(), [player('c', 60), player('l', 60)]).problem).toBeNull()
  })

  it('refuses a player who holds another spot, or has no board unless manual scoring', () => {
    expect(pickProblem(t(), [player('c', 60), player('l', 60, { taken: true })]).problem).toBe('taken')
    expect(pickProblem(t(), [player('c', 60), player('l', 60, { hasBoard: false })]).problem).toBe('board_needed')
    expect(pickProblem(t(null, true), [player('c', 60), player('l', 60, { hasBoard: false })]).problem).toBeNull()
  })

  it('judges the team average from the picked players (the board: 68.4 and 41.2 miss 55+)', () => {
    const ok = pickProblem(t(limit), [player('c', 68.4), player('l', 61.2)])
    expect(ok).toEqual({ problem: null, eligibility: { eligible: true, reason: null, average: 64.8 } })
    const low = pickProblem(t(limit), [player('c', 68.4), player('m', 41.2)])
    expect(low).toEqual({ problem: 'not_eligible', eligibility: { eligible: false, reason: 'below', average: 54.8 } })
  })

  it('judges every player alone when the limit says so', () => {
    const every = { ...limit, teams: 'every' as const }
    expect(pickProblem(t(every), [player('c', 68.4), player('m', 54.9)]).problem).toBe('not_eligible')
  })
})

describe('roster slots', () => {
  const lena: RosterSlot = { position: 1, user: { id: 'l', name: 'Lena' }, confirmed: false }
  const captain: RosterSlot = { position: 0, user: { id: 'c', name: 'Christoph' }, confirmed: true }

  it('fills the places a decline left empty', () => {
    expect(slotsOf([captain], 2)).toEqual([captain, { position: 1, user: null, confirmed: false }])
  })

  it('is complete only when every place is held and confirmed', () => {
    expect(rosterComplete([captain, lena], 2)).toBe(false)
    expect(rosterComplete([captain], 2)).toBe(false)
    expect(rosterComplete([captain, { ...lena, confirmed: true }], 2)).toBe(true)
    expect(waitingFor([captain, lena])).toEqual([lena])
  })
})
