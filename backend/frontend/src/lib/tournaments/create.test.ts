import { describe, expect, it } from 'vitest'
import { setupProblems } from '$shared/tournaments/setup'
import {
  checkInChoices,
  defaultForm,
  finalChoices,
  formProblems,
  fromTournament,
  matchLengthLine,
  previewOf,
  sizeChoices,
  toInput,
  type CreateForm,
  type Tournament,
} from './create'

const now = new Date(2026, 10, 12, 10, 0)
const form = (over: Partial<CreateForm> = {}): CreateForm => ({ ...defaultForm(now), name: 'Pub Pairs Showdown', ...over })

/** As the server would store it. */
const stored = (f: CreateForm): Tournament => ({
  ...toInput(f),
  id: 't1',
  kind: 'community',
  status: 'draft',
  entries: 0,
  owner: { id: 'u1', name: 'Christoph' },
  role: 'owner',
  locked: false,
  registration: 'closed',
  registrationClosesAt: null,
  friendsIn: [],
  inviteCode: null,
  checkedIn: false,
  eligibility: null,
  createdAt: now.toISOString(),
  publishedAt: null,
})

describe('toInput', () => {
  it('sends a setup the server accepts for every kind of tournament', () => {
    const setups: Partial<CreateForm>[] = [
      {},
      { access: 'friends', startMode: 'organizer', plannedFor: '2026-11-20T19:00' },
      { access: 'invite', startMode: 'organizer', noShow: false },
      { access: 'in_person', plannedFor: '2026-11-28T00:00' },
      { gameId: 'cricket', cricketMode: 'cutthroat', entry: 'teams', playersPerTeam: 3 },
      { format: 'groups_knockout', groupSize: 5, through: 1, longerFinal: true, finalSemis: true },
      { format: 'round_robin', maxEntries: 64, longerFinal: true },
      { firstTo: 7, longerFinal: true, finalFirstTo: 3 },
      { registrationCloses: 15, checkInBefore: 60 },
    ]
    for (const s of setups) expect(setupProblems(toInput(form(s))), JSON.stringify(s)).toEqual([])
  })

  it('always gives a public tournament a start time, whatever was picked before', () => {
    const input = toInput(form({ access: 'public', startMode: 'organizer' }))
    expect(input.startsAt).toBe(new Date(2026, 10, 13, 19, 0).toISOString())
    expect(input.settings.registrationClosesMinutes).toBe(60)
    expect(input.settings.checkInMinutes).toBe(30)
  })

  it('has an organizer start use the check-in after the start and the planned-for hint', () => {
    const input = toInput(form({ access: 'friends', startMode: 'organizer', checkInAfter: 2, plannedFor: '2026-11-20T19:00' }))
    expect(input.startsAt).toBeNull()
    expect(input.settings).toMatchObject({
      registrationClosesMinutes: null,
      checkInMinutes: 2,
      plannedFor: new Date(2026, 10, 20, 19, 0).toISOString(),
    })
  })

  it('leaves an in-person tournament without a start time, check-in, no-show wait or manual scoring', () => {
    const input = toInput(form({ access: 'in_person', plannedFor: '2026-11-28T00:00' }))
    expect(input.startsAt).toBeNull()
    expect(input.settings).toMatchObject({
      checkInMinutes: null,
      noShowMinutes: null,
      manualScoring: false,
      plannedFor: new Date(2026, 10, 28).toISOString(),
    })
  })

  it('turns the no-show forfeit off', () => {
    expect(toInput(form({ noShow: false })).settings.noShowMinutes).toBeNull()
    expect(toInput(form({ noShowMinutes: 15 })).settings.noShowMinutes).toBe(15)
  })

  it('sends only the picked game’s options and the team size', () => {
    expect(toInput(form({ startScore: 701, outMode: 'master' })).gameConfig).toEqual({ startScore: 701, outMode: 'master' })
    const cricket = toInput(form({ gameId: 'cricket', cricketMode: 'cutthroat', entry: 'teams', playersPerTeam: 4 }))
    expect(cricket.gameConfig).toEqual({ mode: 'cutthroat' })
    expect(cricket.teamSize).toBe(4)
    expect(toInput(form({ playersPerTeam: 4 })).teamSize).toBe(1)
  })

  it('caps a round robin at 16 entries without a final, and has groups only for groups + knockout', () => {
    const rr = toInput(form({ format: 'round_robin', maxEntries: 64, longerFinal: true }))
    expect(rr.maxEntries).toBe(16)
    expect(rr.settings.longerFinal).toBeNull()
    expect(rr.settings.groups).toBeNull()
    expect(toInput(form({ format: 'groups_knockout', groupSize: 3, through: 1 })).settings.groups).toEqual({ size: 3, through: 1 })
  })

  it('makes the longer final longer than a match', () => {
    expect(toInput(form({ firstTo: 3, longerFinal: true, finalFirstTo: 5 })).settings.longerFinal).toEqual({ firstTo: 5, semis: false })
    expect(toInput(form({ firstTo: 6, longerFinal: true, finalFirstTo: 5 })).settings.longerFinal).toEqual({ firstTo: 7, semis: false })
    expect(toInput(form({ firstTo: 7, longerFinal: true, finalFirstTo: 2 })).settings.longerFinal?.firstTo).toBe(9)
  })

  it('keeps check-in inside the time after registration closes', () => {
    expect(toInput(form({ registrationCloses: 15, checkInBefore: 60 })).settings.checkInMinutes).toBe(15)
    expect(toInput(form({ registrationCloses: 15, checkInBefore: null })).settings.checkInMinutes).toBeNull()
    expect(toInput(form({ registrationCloses: 1440, checkInBefore: 60 })).settings.checkInMinutes).toBe(60)
  })

  it('trims the name and description', () => {
    expect(toInput(form({ name: '  Friday Open ', description: ' Bring a partner \n' }))).toMatchObject({
      name: 'Friday Open',
      description: 'Bring a partner',
    })
  })
})

describe('switching between online and in person', () => {
  it('keeps the planned-for value usable both ways', () => {
    const online = form({ access: 'friends', startMode: 'organizer', plannedFor: '2026-11-20T19:00' })
    const inPerson = { ...online, access: 'in_person' as const }
    expect(toInput(inPerson).settings.plannedFor).toBe(new Date(2026, 10, 20, 19, 0).toISOString())
    expect(formProblems(inPerson, now)).toEqual([])
    expect(previewOf(inPerson).when).toBe('Fri 20 Nov · in person')

    const back = {
      ...form({ access: 'in_person', plannedFor: '2026-11-28T00:00' }),
      access: 'invite' as const,
      startMode: 'organizer' as const,
    }
    expect(toInput(back).settings.plannedFor).toBe(new Date(2026, 10, 28).toISOString())
    expect(previewOf(back).when).toBe('Starts when you start it')
  })
})

describe('fromTournament', () => {
  it('shows a stored tournament as it was set up, so saving it unchanged changes nothing', () => {
    const setups: Partial<CreateForm>[] = [
      {},
      { access: 'friends', startMode: 'organizer', checkInAfter: 10, plannedFor: '2026-11-20T19:00', noShow: false },
      { access: 'invite', startMode: 'organizer' },
      { access: 'in_person', plannedFor: '2026-11-28T00:00' },
      { access: 'in_person' },
      { gameId: 'cricket', cricketMode: 'cutthroat', entry: 'teams', playersPerTeam: 3, firstTo: 2 },
      { format: 'double_elimination', maxEntries: 32, longerFinal: true, finalFirstTo: 9, finalSemis: true, seeding: 'manual' },
      { format: 'groups_knockout', groupSize: 3, through: 1 },
      { registrationCloses: 1440, checkInBefore: null, manualScoring: false },
    ]
    for (const s of setups) {
      const input = toInput(form(s))
      expect(toInput(fromTournament(stored(form(s)), now)), JSON.stringify(s)).toEqual(input)
    }
  })
})

describe('disabled choices', () => {
  it('says why a round robin can’t have 32 or 64 entries', () => {
    const rr = sizeChoices(form({ format: 'round_robin' }))
    expect(rr.filter(c => c.disabled).map(c => c.value)).toEqual([32, 64])
    expect(rr[2].disabled).toMatch(/at most 16/)
    expect(sizeChoices(form()).some(c => c.disabled)).toBe(false)
  })

  it('offers only finals longer than a match', () => {
    expect(
      finalChoices(form({ firstTo: 5 }))
        .filter(c => !c.disabled)
        .map(c => c.value),
    ).toEqual([6, 7, 9, 11])
  })

  it('offers only check-ins that open after registration closes', () => {
    expect(
      checkInChoices(form({ registrationCloses: 15 }))
        .filter(c => !c.disabled)
        .map(c => c.label),
    ).toEqual(['None', '15 min before'])
  })
})

describe('formProblems', () => {
  it('finds nothing wrong with the default setup once it has a name', () => {
    expect(formProblems(form(), now)).toEqual([])
  })

  it('names the field of each problem, as the server checks it', () => {
    expect(formProblems(form({ name: 'ab' }), now)).toEqual(['Name: must be 3-40 characters'])
    expect(formProblems(form({ startsAt: '2026-11-12T10:30' }), now)).toEqual(['Start: registration would already be closed'])
    expect(formProblems(form({ startsAt: '' }), now)).toEqual(['Start: pick a start time'])
  })
})

describe('previewOf', () => {
  it('describes the tournament as Browse will list it', () => {
    expect(previewOf(form())).toEqual({
      access: 'public',
      name: 'Pub Pairs Showdown',
      pills: ['X01 501', 'SOLO', 'Single elim.'],
      when: 'Fri 13 Nov · 19:00',
      size: '16 players',
      help: 'Community tournaments don’t give season points. You can edit everything until the first player registers; after that only the start time and description.',
      primary: 'Create & open registration',
      footnote: 'You’ll get a link to share.',
    })
  })

  it('follows teams, organizer starts and in-person tournaments', () => {
    const teams = previewOf(
      form({ access: 'invite', startMode: 'organizer', gameId: 'cricket', entry: 'teams', playersPerTeam: 3, format: 'groups_knockout' }),
    )
    expect(teams).toMatchObject({
      access: 'invite link',
      pills: ['Cricket', 'TEAMS OF 3', 'Groups + knockout'],
      when: 'Starts when you start it',
      size: '16 teams',
    })
    expect(teams.help).toContain('until the first team registers')

    expect(previewOf(form({ access: 'in_person', plannedFor: '2026-11-28T00:00', format: 'round_robin', maxEntries: 64 }))).toMatchObject({
      access: 'players added by you',
      pills: ['X01 501', 'SOLO', 'Round robin', 'IN PERSON'],
      when: 'Sat 28 Nov · in person',
      size: '16 players',
      primary: 'Create tournament',
      footnote: 'You’ll get claim links for every spot.',
    })
    expect(previewOf(form({ name: '  ' })).name).toBe('Your tournament')
  })
})

describe('matchLengthLine', () => {
  it('spells out first to N as best of 2N-1', () => {
    expect(matchLengthLine(1)).toBe('First to 1 leg wins the match.')
    expect(matchLengthLine(3)).toBe('First to 3 legs wins the match (best of 5).')
    expect(matchLengthLine(7)).toBe('First to 7 legs wins the match (best of 13).')
  })
})
