import { describe, expect, it } from 'vitest'
import type { LiveMatch, LiveMessage } from './live'
import { barLine, deviceLine, feederOf, matchGroups, matchLabel, playedOn, scoreLine } from './mode'

const entry = (id: string) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  status: 'registered' as const,
  seed: null,
  finalPlace: null,
  players: [{ userId: null, name: id, avatar: { kind: 'none' as const } }],
})
const match = (over: Partial<LiveMatch> & Pick<LiveMatch, 'key' | 'round' | 'index'>): LiveMatch => ({
  bracket: 'main',
  group: null,
  firstTo: 3,
  status: 'pending',
  sides: [null, null],
  finishedAt: null,
  outcome: null,
  winner: null,
  legs: [0, 0],
  game: null,
  ...over,
})

// Eight players at the venue (Tournament-Mode): QF 1 and QF 4 done (QF 4 a forfeit), QF 2 on a
// tablet, QF 3 ready; SF 1 waits for QF 2, SF 2 for QF 3
const qf2 = match({
  key: 'R1M2',
  round: 1,
  index: 2,
  status: 'live',
  sides: ['mia', 'paul'],
  legs: [2, 1],
  game: { sessionId: 'g2', throwing: 0, score: [132, 40] },
})
const msg: LiveMessage = {
  type: 'tournament.live',
  tournamentId: 't1',
  status: 'running',
  entries: ['anna', 'jonas', 'mia', 'paul', 'sven', 'lea', 'tom', 'nico'].map(entry),
  matches: [
    match({
      key: 'R1M1',
      round: 1,
      index: 1,
      status: 'finished',
      sides: ['anna', 'jonas'],
      outcome: 'played',
      winner: 0,
      legs: [3, 1],
      finishedAt: '2026-11-15T18:42:00Z',
    }),
    qf2,
    match({ key: 'R1M3', round: 1, index: 3, status: 'ready', sides: ['sven', 'lea'] }),
    match({
      key: 'R1M4',
      round: 1,
      index: 4,
      status: 'finished',
      sides: ['tom', 'nico'],
      outcome: 'walkover',
      winner: 0,
      finishedAt: '2026-11-15T18:50:00Z',
    }),
    match({ key: 'R2M1', round: 2, index: 1, sides: ['anna', null] }),
    match({ key: 'R2M2', round: 2, index: 2, sides: [null, 'tom'] }),
    match({ key: 'R3M1', round: 3, index: 1 }),
  ],
  tables: [],
  schedule: [
    { bracket: 'main', round: 1, name: 'Quarter-finals', state: 'now', at: null },
    { bracket: 'main', round: 2, name: 'Semi-finals', state: 'later', at: null },
    { bracket: 'main', round: 3, name: 'Final', state: 'later', at: null },
  ],
}
const t = { gameId: 'x01', gameConfig: { startScore: 501 }, format: 'single_elimination' as const, teamSize: 1 }

describe('tournament mode', () => {
  it('names matches short, and says how far the stage is', () => {
    expect(msg.matches.map(m => matchLabel(msg, 'single_elimination', m))).toEqual([
      'QF 1',
      'QF 2',
      'QF 3',
      'QF 4',
      'SF 1',
      'SF 2',
      'Final',
    ])
    expect(barLine(t, msg)).toBe('X01 501 · single elimination · 8 players · Quarter-finals: 2 of 4 done')
    expect(barLine(t, { ...msg, status: 'open', matches: [], schedule: [] })).toBe('X01 501 · single elimination · 8 players · Not started')
  })

  it('groups the matches: ready, the next round, playing, finished latest first', () => {
    const g = matchGroups(msg)
    expect(g.ready.map(m => m.key)).toEqual(['R1M3'])
    // The final is two rounds away: not up next yet
    expect(g.upNext.map(m => m.key)).toEqual(['R2M1', 'R2M2'])
    expect(g.playing.map(m => m.key)).toEqual(['R1M2'])
    expect(g.finished.map(m => m.key)).toEqual(['R1M4', 'R1M1'])
  })

  it('knows which match decides an empty side', () => {
    const [sf1, sf2] = msg.matches.filter(m => m.round === 2)
    expect(feederOf(msg, sf1, 1)?.key).toBe('R1M2')
    expect(feederOf(msg, sf2, 0)?.key).toBe('R1M3')
    expect(feederOf(msg, msg.matches[0], 0)).toBeNull()
    expect(feederOf(msg, { ...sf1, bracket: 'lower' }, 1)).toBeNull()
  })

  it('shows the live leg, who plays a match, and pauses one no device plays', () => {
    expect(scoreLine(qf2, ['Mia K.', 'Paul'], 'x01')).toBe('Leg 4 · Mia K. 132 left · Paul 40 left')
    expect(scoreLine(qf2, ['Mia K.', 'Paul'], 'cricket')).toBe('Leg 4 · Mia K. 132 · Paul 40')
    expect(scoreLine({ ...qf2, game: { sessionId: 'g2', throwing: null, score: null } }, ['Mia K.', 'Paul'], 'x01')).toBe('Leg 4')
    const stage = { id: 'd2', name: 'Tablet · Stage', matchKey: 'R1M2' }
    const bar = { id: 'd1', name: 'Tablet · Bar', matchKey: null }
    expect(playedOn(qf2, [bar, stage])).toBe(stage)
    expect(playedOn(qf2, [bar])).toBeNull()
    expect(deviceLine(stage, msg, 'single_elimination')).toBe('Playing QF 2')
    expect(deviceLine(bar, msg, 'single_elimination')).toBe('Free')
  })
})
