import { describe, expect, it } from 'vitest'
import type { Friend, TeamInvite } from '$lib/api/lobby-ws'
import type { Team } from './actions'
import { captainLine, expiresIn, inviteSummary, invitedLine, nextTournament, pickerPeople, ratingText, tournamentResult } from './view'

const NOW = new Date('2026-11-12T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 3600 * 1000).toISOString()
const none = { kind: 'none' } as const
const ref = (id: string) => ({ id, name: id[0].toUpperCase() + id.slice(1), avatar: none })

const team = (over: Partial<Team> = {}): Team => ({
  id: 't1',
  name: 'Double Agents',
  tag: 'DA',
  color: '#9b7bff',
  captainUserId: 'anna',
  createdAt: days(-40),
  members: [
    { user: ref('anna'), joinedAt: days(-40), rating: 1284 },
    { user: ref('lena'), joinedAt: days(-30), rating: null },
  ],
  invites: [],
  record: { wins: 7, losses: 3, tournaments: 3, bestPlace: 2 },
  average: 64.83,
  tournaments: [],
  ...over,
})
type Entry = Team['tournaments'][number]
const entry = (over: Partial<Entry>): Entry => ({
  id: 'cup',
  name: 'Cup',
  startsAt: days(3),
  status: 'open',
  entryStatus: 'registered',
  finalPlace: null,
  ...over,
})

describe('invite wording', () => {
  it('counts whole days left, and says today on the last one', () => {
    expect(expiresIn(days(6.5), NOW)).toBe('expires in 6 days')
    expect(expiresIn(days(1.2), NOW)).toBe('expires in 1 day')
    expect(expiresIn(days(0.4), NOW)).toBe('expires today')
  })

  it('says when you were invited', () => {
    expect(invitedLine({ createdAt: days(-2), expiresAt: days(5) }, NOW)).toBe('Invited 2 days ago · expires in 5 days')
    expect(invitedLine({ createdAt: NOW.toISOString(), expiresAt: days(7) }, NOW)).toBe('Invited today · expires in 7 days')
  })

  it("lists the team's first players and how many more", () => {
    const invite: TeamInvite = {
      id: 'i1',
      team: { id: 't1', name: 'Bullseye Bandits', tag: 'BB', color: '#4fd1c5' },
      inviter: ref('sophie'),
      members: ['sophie', 'pia', 'ben', 'nico'].map(ref),
      memberCount: 6,
      createdAt: NOW.toISOString(),
      expiresAt: days(6.5),
    }
    expect(inviteSummary(invite, NOW)).toBe('6 players · Sophie, Pia, Ben, Nico +2 · invite expires in 6 days')
  })
})

describe('a team', () => {
  it('names its captain, or says it is you', () => {
    expect(captainLine(team(), 'anna')).toBe('You’re captain')
    expect(captainLine(team(), 'lena')).toBe('Captain: Anna')
  })

  it('writes ratings with a thin space, and a dash before placement', () => {
    expect(ratingText(1284)).toBe('1\u2009284')
    expect(ratingText(null)).toBe('–')
  })

  it('shows a place, else where the entry stands', () => {
    expect(tournamentResult(entry({ status: 'finished', finalPlace: 1 }))).toEqual({ text: '1st', tone: 'gold' })
    expect(tournamentResult(entry({ status: 'finished', finalPlace: 2 }))).toEqual({ text: '2nd', tone: 'silver' })
    expect(tournamentResult(entry({ status: 'finished', finalPlace: 5 }))).toEqual({ text: '5th', tone: 'dim' })
    expect(tournamentResult(entry({ entryStatus: 'pending' }))).toEqual({ text: 'Pending', tone: 'pending' })
    expect(tournamentResult(entry({ status: 'running' }))).toEqual({ text: 'Playing', tone: 'silver' })
    expect(tournamentResult(entry({}))).toEqual({ text: 'Registered', tone: 'silver' })
  })

  it('takes the soonest tournament still to play as next, never a withdrawn or finished one', () => {
    const t = team({
      tournaments: [
        entry({ id: 'later', startsAt: days(9) }),
        entry({ id: 'done', status: 'finished', startsAt: days(-3) }),
        entry({ id: 'out', entryStatus: 'withdrawn', startsAt: days(1) }),
        entry({ id: 'soon', startsAt: days(2) }),
        entry({ id: 'whenever', startsAt: null }),
      ],
    })
    expect(nextTournament(t)?.id).toBe('soon')
    expect(nextTournament(team())).toBeNull()
  })
})

describe('pickerPeople', () => {
  const friend = (id: string, online: boolean): Friend => ({
    ...ref(id),
    friendsSince: NOW.toISOString(),
    status: online ? { kind: 'online' } : { kind: 'offline' },
    inYourLobby: false,
    invited: false,
  })
  const friends = [friend('marco', true), friend('anna', false), friend('jule', true), friend('tom', false)]

  it('offers your friends online first while nothing is typed, leaving out who is excluded', () => {
    expect(pickerPeople(friends, [], '', ['jule']).map(p => [p.id, p.detail])).toEqual([
      ['marco', 'Friend · online'],
      ['anna', 'Friend'],
      ['tom', 'Friend'],
    ])
  })

  it('filters friends by what is typed, then adds the account with that exact name', () => {
    expect(pickerPeople(friends, [{ id: 'mia', name: 'Mia' }], 'm', []).map(p => [p.id, p.detail])).toEqual([
      ['marco', 'Friend · online'],
      ['mia', 'Player'],
    ])
    // A friend found by the lookup too is listed once, and an excluded account not at all
    expect(pickerPeople(friends, [{ id: 'tom', name: 'Tom' }], 'tom', []).map(p => p.id)).toEqual(['tom'])
    expect(pickerPeople(friends, [{ id: 'mia', name: 'Mia' }], 'mia', ['mia'])).toEqual([])
  })
})
