import { describe, expect, it } from 'vitest'
import type { Tournament } from '$lib/api'
import {
  canWatch,
  headline,
  myEntryId,
  recordOf,
  rulesOf,
  sectionsOf,
  stageWhen,
  yourMatch,
  yourMatchLine,
  type LiveMatch,
  type LiveMessage,
} from './live'

const entry = (id: string, userId: string | null = `u-${id}`) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  status: 'checked_in' as const,
  seed: null,
  finalPlace: null,
  players: [{ userId, name: id, avatar: { kind: 'none' as const } }],
})
const match = (over: Partial<LiveMatch> & Pick<LiveMatch, 'key' | 'round' | 'index'>): LiveMatch => ({
  bracket: 'main',
  group: null,
  firstTo: 3,
  status: 'pending',
  sides: [null, null],
  outcome: null,
  winner: null,
  legs: [0, 0],
  game: null,
  ...over,
})

// Four players: chris plays max (live, max throwing), lena beat tom, the final waits for both
const msg: LiveMessage = {
  type: 'tournament.live',
  tournamentId: 't1',
  status: 'running',
  entries: [entry('chris'), entry('max'), entry('lena'), entry('tom')],
  matches: [
    match({
      key: 'R1M1',
      round: 1,
      index: 1,
      status: 'live',
      sides: ['chris', 'max'],
      legs: [1, 2],
      game: { sessionId: 's1', throwing: 1 },
    }),
    match({ key: 'R1M2', round: 1, index: 2, status: 'finished', sides: ['lena', 'tom'], outcome: 'played', winner: 0, legs: [3, 1] }),
    match({ key: 'R2M1', round: 2, index: 1, sides: [null, 'lena'] }),
  ],
  tables: [],
  schedule: [
    { bracket: 'main', round: 1, name: 'Semi-finals', state: 'now', at: null },
    { bracket: 'main', round: 2, name: 'Final', state: 'later', at: '2026-11-14T21:10:00.000Z' },
  ],
}

describe('live tournament view', () => {
  it('finds your entry and your match on, with its leg score and who throws', () => {
    expect(myEntryId(msg, 'u-chris')).toBe('chris')
    expect(myEntryId(msg, 'stranger')).toBeNull()
    const y = yourMatch(msg, 'single_elimination', 'u-chris')
    expect(y).toMatchObject({ side: 0, stage: 'Semi-final', opponent: { name: 'Max' } })
    expect(y && yourMatchLine(y)).toBe('Leg 4 · you 1 – 2 Max · Max is throwing')
    // From the other side, the legs turn round
    const other = yourMatch(msg, 'single_elimination', 'u-max')
    expect(other && yourMatchLine(other)).toBe("Leg 4 · you 2 – 1 Chris · you're throwing")
    expect(yourMatch(msg, 'single_elimination', 'u-lena')).toBeNull()
  })

  it('says a ready match starts once both are there', () => {
    const ready: LiveMessage = { ...msg, matches: [match({ key: 'R2M1', round: 2, index: 1, status: 'ready', sides: ['chris', 'lena'] })] }
    const y = yourMatch(ready, 'single_elimination', 'u-lena')
    expect(y && yourMatchLine(y)).toBe('Starts once you and Chris are both online and free')
  })

  it('offers Watch on a live game you are not in, never on your own or one not being played', () => {
    const [live, done] = msg.matches
    expect(canWatch(live, null)).toBe(true)
    expect(canWatch(live, 'lena')).toBe(true)
    expect(canWatch(live, 'chris')).toBe(false)
    expect(canWatch(done, null)).toBe(false)
  })

  it('lays the knockout out in columns per round, named', () => {
    expect(sectionsOf(msg, 'single_elimination').map(s => [s.title, s.columns.map(c => [c.name, c.matches.map(m => m.key)])])).toEqual([
      [
        'Bracket',
        [
          ['Semi-finals', ['R1M1', 'R1M2']],
          ['Final', ['R2M1']],
        ],
      ],
    ])
    const de: LiveMessage = {
      ...msg,
      matches: [
        match({ key: 'R1M1', round: 1, index: 1 }),
        match({ key: 'L1M1', bracket: 'lower', round: 1, index: 1 }),
        match({ key: 'GF1', bracket: 'final', round: 1, index: 1 }),
      ],
    }
    expect(sectionsOf(de, 'double_elimination').map(s => [s.title, s.columns.map(c => c.name)])).toEqual([
      ['Upper bracket', ['Upper final']],
      ['Lower bracket', ['Lower final']],
      ['Grand final', ['Grand final']],
    ])
  })

  it('heads the page with the stage being played', () => {
    expect(headline(msg)).toEqual({ text: 'Live · Semi-finals', live: true })
    expect(headline({ ...msg, status: 'finished' })).toEqual({ text: 'Finished', live: false })
  })

  it('counts wins and losses, byes left out', () => {
    expect(recordOf(msg, 'lena')).toEqual({ won: 1, lost: 0 })
    expect(recordOf(msg, 'tom')).toEqual({ won: 0, lost: 1 })
    expect(recordOf(msg, 'chris')).toEqual({ won: 0, lost: 0 })
  })

  it('times later stages roughly, today without the day', () => {
    const [now, later] = msg.schedule
    expect(stageWhen(now)).toBe('now')
    expect(stageWhen(later, new Date('2026-11-14T12:00:00Z'))).toMatch(/^≈ \d\d:\d\d$/)
    expect(stageWhen(later, new Date('2026-11-10T12:00:00Z'))).toMatch(/^≈ \S+ \d\d:\d\d$/)
  })

  it('writes the rules from the settings', () => {
    const settings: Tournament['settings'] = {
      seeding: 'rating',
      firstTo: 3,
      longerFinal: { firstTo: 5, semis: false },
      groups: null,
      registrationClosesMinutes: null,
      checkInMinutes: null,
      plannedFor: null,
      manualScoring: false,
      noShowMinutes: 10,
      avgLimit: null,
    }
    expect(rulesOf({ access: 'friends', settings })).toEqual([
      'Every match is first to 3 legs.',
      'The final is first to 5.',
      'Next round starts as soon as both players are ready.',
      'No-show for 10 minutes = forfeit.',
      'Every player plays on their own paired board.',
      'Withdrawing once it runs forfeits your remaining matches.',
    ])
  })
})
