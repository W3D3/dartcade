import { describe, expect, it } from 'vitest'
import { registrationClosesAt, registrationState, type RegistrationTournament } from './registration.js'

const now = new Date('2026-11-16T12:00:00Z')
const open: RegistrationTournament = {
  status: 'open',
  access: 'public',
  teamSize: 1,
  maxEntries: 8,
  entries: 3,
  startsAt: '2026-11-16T18:00:00Z',
  settings: { registrationClosesMinutes: 60, manualScoring: false, avgLimit: null },
}
const me = { registered: false, hasBoard: true, eligible: true }

describe('registrationState', () => {
  it('opens registration with a paired board and a free spot', () => {
    expect(registrationState(open, me, now)).toBe('open')
  })

  it('is full once every spot is taken', () => {
    expect(registrationState({ ...open, entries: 8 }, me, now)).toBe('full')
  })

  it('closes at the registration close before a fixed start', () => {
    expect(registrationState(open, me, new Date('2026-11-16T16:59:59Z'))).toBe('open')
    expect(registrationState(open, me, new Date('2026-11-16T17:00:00Z'))).toBe('closed')
  })

  it('stays open until an organizer starts one without a start time', () => {
    const organizerStart = { ...open, startsAt: null, settings: { ...open.settings, registrationClosesMinutes: null } }
    expect(registrationState(organizerStart, me, new Date('2030-01-01T00:00:00Z'))).toBe('open')
    expect(registrationState({ ...organizerStart, status: 'check_in' }, me, now)).toBe('closed')
  })

  it('needs a paired board unless the organizer allows manual scoring', () => {
    expect(registrationState(open, { ...me, hasBoard: false }, now)).toBe('board_needed')
    expect(registrationState({ ...open, settings: { ...open.settings, manualScoring: true } }, { ...me, hasBoard: false }, now)).toBe(
      'open',
    )
  })

  it('refuses a player outside the average limit, before asking for a board', () => {
    expect(registrationState(open, { ...me, eligible: false, hasBoard: false }, now)).toBe('not_eligible')
    expect(registrationState({ ...open, entries: 8 }, { ...me, eligible: false }, now)).toBe('full')
  })

  it('says registered whatever else holds', () => {
    expect(registrationState({ ...open, status: 'running', entries: 8 }, { ...me, registered: true }, now)).toBe('registered')
  })

  it('leaves team and in-person tournaments to their captains and organizers', () => {
    expect(registrationState({ ...open, teamSize: 2 }, me, now)).toBe('team')
    expect(registrationState({ ...open, access: 'in_person', startsAt: null }, me, now)).toBe('in_person')
  })
})

it('registrationClosesAt subtracts the close from the start', () => {
  expect(registrationClosesAt(open)).toBe('2026-11-16T17:00:00.000Z')
  expect(registrationClosesAt({ startsAt: null, settings: open.settings })).toBeNull()
})

describe('registrationState for a team', () => {
  const teams = { ...open, teamSize: 2 }

  it('sends a player to their captain, and lets the captain register the team', () => {
    expect(registrationState(teams, me, now)).toBe('team')
    expect(registrationState(teams, { ...me, team: true }, now)).toBe('open')
  })

  it('counts pending teams against the spots', () => {
    expect(registrationState({ ...teams, entries: 8 }, { ...me, team: true }, now)).toBe('full')
  })

  it('refuses picks outside the limit or without boards, and a team already in', () => {
    expect(registrationState(teams, { ...me, team: true, eligible: false }, now)).toBe('not_eligible')
    expect(registrationState(teams, { ...me, team: true, hasBoard: false }, now)).toBe('board_needed')
    expect(registrationState(teams, { ...me, team: true, registered: true }, now)).toBe('registered')
  })
})
