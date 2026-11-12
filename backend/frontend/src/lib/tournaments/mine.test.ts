import { describe, expect, it } from 'vitest'
import type { MyTournamentRef, MyTournaments } from '$lib/api'
import { asLine, filterMine, mineCount, organizingLine, playedAs, statusLine, upcomingOf } from './mine'

const ref = (id: string, over: Partial<MyTournamentRef> = {}): MyTournamentRef => ({
  id,
  name: id,
  kind: 'community',
  access: 'public',
  status: 'open',
  gameId: 'x01',
  gameConfig: {},
  format: 'single_elimination',
  teamSize: 1,
  maxEntries: 8,
  entries: 3,
  startsAt: null,
  owner: { id: 'o', name: 'Max' },
  ...over,
})
const playing = (id: string, over: Partial<MyTournamentRef> = {}, extra: object = {}) => ({
  tournament: ref(id, over),
  entryName: 'Me',
  playerName: 'Me',
  team: null,
  opponent: null,
  ...extra,
})

const mine: MyTournaments = {
  liveMatch: { tournament: ref('live', { status: 'running' }), round: 'Final', opponent: 'Max', firstTo: 3, sessionId: 's' },
  playing: [
    playing('live', { status: 'running' }),
    playing(
      'cup',
      { teamSize: 2 },
      {
        entryName: 'Double Agents',
        team: {
          entryId: 'e',
          status: 'pending',
          team: null,
          captainId: 'me',
          confirmBy: null,
          slots: [
            { position: 0, user: { id: 'me', name: 'Christoph' }, confirmed: true },
            { position: 1, user: { id: 'lena', name: 'Lena' }, confirmed: false },
            { position: 2, user: { id: 'tom', name: 'Tom' }, confirmed: false },
          ],
        },
      },
    ),
    playing('club', { access: 'in_person' }, { playerName: 'Chris' }),
  ],
  organizing: [
    { tournament: ref('own', { access: 'in_person' }), role: 'owner', claimed: 2, createdAt: '2026-11-01T00:00:00Z' },
    { tournament: ref('draft', { status: 'draft' }), role: 'owner', claimed: null, createdAt: '2026-11-01T00:00:00Z' },
  ],
  past: [
    {
      tournament: ref('old', { status: 'finished', teamSize: 2 }),
      entryName: 'Duo',
      playerName: 'Me',
      place: 2,
      won: 1,
      lost: 1,
      average: 70.2,
      endedAt: null,
    },
  ],

  season: { label: 'Q4 2026', played: 1, titles: 0, won: 1, lost: 1, average: 70.2, best: null },
}

describe('the tab list', () => {
  it('counts the tournaments you play in, and the banner match is one of them, not listed twice', () => {
    expect(mineCount(mine)).toBe(3)
    expect(upcomingOf(mine).map(p => p.tournament.id)).toEqual(['cup', 'club'])
    const shown = filterMine(mine, 'all')
    expect((shown.live ? 1 : 0) + shown.upcoming.length).toBe(mineCount(mine))
  })

  it('filters by how you take part', () => {
    const ids = (f: Parameters<typeof filterMine>[1]) => {
      const r = filterMine(mine, f)
      return [
        r.live?.tournament.id ?? '-',
        ...r.upcoming.map(p => p.tournament.id),
        '|',
        ...r.organizing.map(o => o.tournament.id),
        '|',
        ...r.past.map(p => p.tournament.id),
      ].join(' ')
    }
    expect(ids('all')).toBe('live cup club | own draft | old')
    expect(ids('playing')).toBe('live cup club | | old')
    expect(ids('organizing')).toBe('- | own draft |')
    expect(ids('teams')).toBe('- cup | | old')
    expect(ids('in_person')).toBe('- club | own |')
  })
})

describe('row text', () => {
  it('says what is open for you', () => {
    const [, cup, club] = mine.playing
    expect(statusLine(cup, 'me')).toEqual({ text: 'Waiting for Lena and Tom to confirm', tone: 'warn' })
    expect(statusLine(cup, 'lena')).toEqual({ text: 'Confirm your place', tone: 'warn' })
    expect(statusLine(club, 'me')).toEqual({ text: "Claimed spot · played on Max's devices", tone: 'plain' })
    expect(statusLine(playing('a', { status: 'check_in' }), 'me')).toEqual({ text: 'Check-in is open', tone: 'good' })
    expect(statusLine(playing('a', { status: 'running' }), 'me').text).toBe('In progress')
    expect(statusLine(playing('a'), 'me').text).toBe('Registered')
  })

  it('names who you play as', () => {
    const [, cup, club] = mine.playing
    expect(asLine(cup)).toBe('as Double Agents')
    expect(asLine(club)).toBe('as “Chris”')
    expect(asLine(playing('a', {}, { opponent: 'Tom' }))).toBe('vs Tom')
    expect(playedAs(mine.past[0])).toBe('Duo')
  })

  it('describes what you organize', () => {
    expect(organizingLine(mine.organizing[0], 'Sat 28 Nov')).toBe('Sat 28 Nov · 3 players · 2 claimed')
    expect(organizingLine(mine.organizing[1], null)).toBe('Not published yet')
    expect(organizingLine({ ...mine.organizing[0], role: 'organizer', claimed: null }, null)).toBe(
      'Organizer · owner Max · 3 / 8 registered',
    )
  })
})
