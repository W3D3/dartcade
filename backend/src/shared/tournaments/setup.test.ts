import { describe, expect, it } from 'vitest'
import { lockedChanges, setupProblems, startProblems, type TournamentSetup } from './setup.js'

const fixed: TournamentSetup = {
  name: 'Pub Pairs Showdown',
  description: '',
  access: 'public',
  format: 'single_elimination',
  maxEntries: 16,
  startsAt: '2026-11-23T15:00:00.000Z',
  settings: {
    seeding: 'rating',
    firstTo: 3,
    longerFinal: null,
    groups: null,
    registrationClosesMinutes: 60,
    checkInMinutes: 30,
    plannedFor: null,
    manualScoring: false,
    noShowMinutes: 10,
  },
}
const organizerStart: TournamentSetup = {
  ...fixed,
  access: 'friends',
  startsAt: null,
  settings: { ...fixed.settings, registrationClosesMinutes: null, checkInMinutes: 5, plannedFor: '2026-11-23T15:00:00.000Z' },
}
const inPerson: TournamentSetup = {
  ...organizerStart,
  access: 'in_person',
  settings: { ...organizerStart.settings, checkInMinutes: null, noShowMinutes: null },
}

const with_ = (t: TournamentSetup, change: Partial<TournamentSetup>, settings: Partial<TournamentSetup['settings']> = {}) => ({
  ...t,
  ...change,
  settings: { ...t.settings, ...settings },
})
const paths = (t: TournamentSetup) => setupProblems(t).map(p => p.path)

describe('setupProblems', () => {
  it('accepts a fixed start, an organizer start and an in-person tournament', () => {
    expect(setupProblems(fixed)).toEqual([])
    expect(setupProblems(organizerStart)).toEqual([])
    expect(setupProblems(inPerson)).toEqual([])
  })

  it('holds names to 3-40 characters and texts free of control characters', () => {
    expect(paths(with_(fixed, { name: 'ab' }))).toEqual(['body/name'])
    expect(paths(with_(fixed, { name: 'x'.repeat(41) }))).toEqual(['body/name'])
    expect(paths(with_(fixed, { name: 'Cup\u0007' }))).toEqual(['body/name'])
    expect(paths(with_(fixed, { description: 'x'.repeat(281) }))).toEqual(['body/description'])
    expect(paths(with_(fixed, { description: 'a\nb' }))).toEqual(['body/description'])
    // Characters, not UTF-16 units
    expect(paths(with_(fixed, { name: '🎯🎯🎯' }))).toEqual([])
  })

  it('gives groups to groups + knockout only, and requires them there', () => {
    expect(paths(with_(fixed, { format: 'groups_knockout' }))).toEqual(['body/settings/groups'])
    expect(paths(with_(fixed, { format: 'groups_knockout' }, { groups: { size: 4, through: 2 } }))).toEqual([])
    expect(paths(with_(fixed, {}, { groups: { size: 4, through: 2 } }))).toEqual(['body/settings/groups'])
  })

  it('caps a round robin at 16 entries and gives it no final', () => {
    expect(paths(with_(fixed, { format: 'round_robin' }))).toEqual([])
    expect(paths(with_(fixed, { format: 'round_robin', maxEntries: 32 }))).toEqual(['body/maxEntries'])
    expect(paths(with_(fixed, { format: 'round_robin' }, { longerFinal: { firstTo: 5, semis: false } }))).toEqual([
      'body/settings/longerFinal',
    ])
  })

  it('makes a longer final longer than a match', () => {
    expect(paths(with_(fixed, {}, { longerFinal: { firstTo: 5, semis: true } }))).toEqual([])
    expect(paths(with_(fixed, {}, { longerFinal: { firstTo: 3, semis: false } }))).toEqual(['body/settings/longerFinal'])
  })

  it('lets an organizer start only a tournament that is not public', () => {
    expect(paths(with_(organizerStart, { access: 'public' }))).toEqual(['body/startsAt'])
    expect(paths(with_(organizerStart, { access: 'invite' }))).toEqual([])
  })

  it('always has an organizer start an in-person tournament, with no check-in or no-show wait', () => {
    expect(paths(with_(inPerson, { startsAt: fixed.startsAt }, { registrationClosesMinutes: 60, plannedFor: null }))).toEqual([
      'body/startsAt',
    ])
    expect(paths(with_(inPerson, {}, { checkInMinutes: 5 }))).toEqual(['body/settings/checkInMinutes'])
    expect(paths(with_(inPerson, {}, { noShowMinutes: 10 }))).toEqual(['body/settings/noShowMinutes'])
  })

  it('lets an online tournament go without a no-show forfeit', () => {
    expect(paths(with_(fixed, {}, { noShowMinutes: null }))).toEqual([])
  })

  it('fits the registration and check-in settings to the kind of start', () => {
    expect(paths(with_(fixed, {}, { registrationClosesMinutes: null }))).toEqual(['body/settings/registrationClosesMinutes'])
    expect(paths(with_(fixed, {}, { checkInMinutes: null }))).toEqual([])
    expect(paths(with_(fixed, {}, { checkInMinutes: 5 }))).toEqual(['body/settings/checkInMinutes'])
    expect(paths(with_(fixed, {}, { plannedFor: fixed.startsAt }))).toEqual(['body/settings/plannedFor'])
    expect(paths(with_(organizerStart, {}, { registrationClosesMinutes: 60 }))).toEqual(['body/settings/registrationClosesMinutes'])
    expect(paths(with_(organizerStart, {}, { checkInMinutes: 30 }))).toEqual(['body/settings/checkInMinutes'])
    expect(paths(with_(organizerStart, {}, { checkInMinutes: null }))).toEqual(['body/settings/checkInMinutes'])
  })

  it('opens check-in only once registration has closed', () => {
    expect(paths(with_(fixed, {}, { registrationClosesMinutes: 15, checkInMinutes: 30 }))).toEqual(['body/settings/checkInMinutes'])
    expect(paths(with_(fixed, {}, { registrationClosesMinutes: 60, checkInMinutes: 60 }))).toEqual([])
  })
})

describe('startProblems', () => {
  const start = Date.parse(fixed.startsAt!)
  it('refuses a start whose registration would already be closed', () => {
    expect(startProblems(fixed, new Date(start - 61 * 60_000))).toEqual([])
    expect(startProblems(fixed, new Date(start - 60 * 60_000))).toEqual([
      { path: 'body/startsAt', message: 'registration would already be closed' },
    ])
  })
  it('has nothing to check when an organizer starts it', () => {
    expect(startProblems(organizerStart, new Date('2030-01-01'))).toEqual([])
  })
})

describe('lockedChanges', () => {
  const input = { ...fixed, gameConfig: { startScore: 501, outMode: 'double' } }
  it('leaves out the start time, its registration and check-in settings, and the description', () => {
    const moved = {
      ...input,
      startsAt: '2026-11-24T15:00:00.000Z',
      description: 'Bring a partner',
      settings: { ...input.settings, checkInMinutes: 15 },
    }
    expect(lockedChanges(input, moved)).toEqual([])
  })
  it('names every other changed field and setting', () => {
    const changed = {
      ...input,
      name: 'Other',
      gameConfig: { startScore: 301, outMode: 'double' },
      settings: { ...input.settings, firstTo: 4 },
    }
    expect(lockedChanges(input, changed)).toEqual(['name', 'settings.firstTo', 'gameConfig'])
  })
  it('does not count reordered keys as a change', () => {
    expect(lockedChanges(input, { ...input, gameConfig: { outMode: 'double', startScore: 501 } })).toEqual([])
  })
})
