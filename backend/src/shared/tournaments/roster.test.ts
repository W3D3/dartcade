import { describe, expect, it } from 'vitest'
import type { AvgLimit } from './avgLimit.js'
import type { GuestRules } from './guests.js'
import { pickProblem, rosterComplete, slotsOf, waitingFor, type Candidate, type RosterSlot } from './roster.js'

const limit: AvgLimit = { min: 55, max: null, teams: 'team', minLegs: 0, lock: true }
const t = (
  avgLimit: AvgLimit | null = null,
  manualScoring = false,
  play: 'online' | 'in_person' = 'online',
  guests: GuestRules | null = null,
) => ({
  teamSize: 2,
  play,
  settings: { registrationClosesMinutes: null, manualScoring, avgLimit, guests },
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
    expect(pickProblem(t(null, false, 'in_person'), [player('c', 60), player('l', 60, { hasBoard: false })]).problem).toBeNull()
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

describe('pickProblem with guests', () => {
  const rules: GuestRules = { perTeam: 1, average: 50 }

  it('fills a place with a guest only where the organizer allows it, up to the cap', () => {
    expect(pickProblem(t(), [player('c', 60)], 1).problem).toBe('guests')
    expect(pickProblem(t(null, false, 'online', rules), [player('c', 60)], 1).problem).toBeNull()
    expect(pickProblem({ ...t(null, false, 'online', rules), teamSize: 3 }, [player('c', 60)], 2).problem).toBe('guests')
    expect(
      pickProblem({ ...t(null, false, 'online', { perTeam: null, average: 50 }), teamSize: 3 }, [player('c', 60)], 2).problem,
    ).toBeNull()
  })

  it('keeps one player with an account, and counts places', () => {
    expect(pickProblem(t(null, false, 'online', { perTeam: null, average: 50 }), [], 2).problem).toBe('count')
    expect(pickProblem(t(null, false, 'online', rules), [player('c', 60)], 0).problem).toBe('count')
  })

  it('counts a guest as the organizer’s average against the limit (60 and 50 miss 55+, 68.4 and 50 do not)', () => {
    const guests = t(limit, false, 'online', rules)
    expect(pickProblem(guests, [player('c', 68.4)], 1)).toEqual({
      problem: null,
      eligibility: { eligible: true, reason: null, average: 59.2 },
    })
    expect(pickProblem(guests, [player('c', 54)], 1).problem).toBe('not_eligible')
  })

  it('needs the captain’s board for a guest, unless scores are typed', () => {
    const online = t(null, false, 'online', rules)
    expect(pickProblem(online, [player('l', 60)], 1, false).problem).toBe('board_needed')
    expect(pickProblem(online, [player('l', 60)], 1, true).problem).toBeNull()
    expect(pickProblem(t(null, true, 'online', rules), [player('l', 60)], 1, false).problem).toBeNull()
  })

  it('a guest is a confirmed place', () => {
    const guest: RosterSlot = { position: 1, user: null, guest: 'Papa', confirmed: true }
    const captain: RosterSlot = { position: 0, user: { id: 'c', name: 'C' }, guest: null, confirmed: true }
    expect(rosterComplete([captain, guest], 2)).toBe(true)
    expect(waitingFor([captain, guest])).toEqual([])
  })
})

describe('roster slots', () => {
  const lena: RosterSlot = { position: 1, user: { id: 'l', name: 'Lena' }, guest: null, confirmed: false }
  const captain: RosterSlot = { position: 0, user: { id: 'c', name: 'Christoph' }, guest: null, confirmed: true }

  it('fills the places a decline left empty', () => {
    expect(slotsOf([captain], 2)).toEqual([captain, { position: 1, user: null, guest: null, confirmed: false }])
  })

  it('is complete only when every place is held and confirmed', () => {
    expect(rosterComplete([captain, lena], 2)).toBe(false)
    expect(rosterComplete([captain], 2)).toBe(false)
    expect(rosterComplete([captain, { ...lena, confirmed: true }], 2)).toBe(true)
    expect(waitingFor([captain, lena])).toEqual([lena])
  })
})
