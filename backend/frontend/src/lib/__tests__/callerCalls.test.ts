import { describe, it, expect } from 'vitest'
import { callsFor, pickClips, type CallGame } from '../caller/calls.js'

const dart = (score: number) => ({ score }) as CallGame['currentVisitDarts'][number]
const game = (o: Partial<CallGame> = {}): CallGame => ({
  scores: [501, 501],
  legs: [0, 0],
  firstTo: 2,
  currentPlayer: 0,
  phase: 'game',
  bustThisVisit: false,
  visitLocked: false,
  currentVisitDarts: [],
  visitStartScores: [501, 501],
  totalVisits: [0, 0],
  ...o,
})

describe('callsFor', () => {
  it('calls the total when the third dart lands, not again at the takeout', () => {
    const two = game({ scores: [381, 501], currentVisitDarts: [dart(60), dart(60)] })
    const three = game({ scores: [321, 501], currentVisitDarts: [dart(60), dart(60), dart(60)] })
    expect(callsFor(two, three)).toEqual([['180']])
    const next = game({ scores: [321, 501], currentPlayer: 1, totalVisits: [1, 0] })
    expect(callsFor(three, next)).toEqual([])
  })

  it('calls a short visit at the takeout / next player, and an empty one as 0', () => {
    const one = game({ scores: [441, 501], currentVisitDarts: [dart(60)] })
    expect(callsFor(one, game({ scores: [441, 501], currentPlayer: 1, totalVisits: [1, 0] }))).toEqual([['60']])
    expect(callsFor(game(), game({ currentPlayer: 1, totalVisits: [1, 0] }))).toEqual([['0']])
  })

  it('a bust says busted', () => {
    const before = game({ scores: [32, 501], currentVisitDarts: [dart(20)] })
    const after = game({ scores: [32, 501], currentVisitDarts: [dart(20), dart(13)], visitLocked: true, bustThisVisit: true })
    expect(callsFor(before, after)).toEqual([['busted']])
  })

  it('a checkout says game shot and the leg just won; the last leg says match shot', () => {
    const before = game({ scores: [40, 501], currentVisitDarts: [dart(0)] })
    const leg = game({ scores: [0, 501], currentVisitDarts: [dart(0), dart(40)], visitLocked: true })
    expect(callsFor(before, leg)).toEqual([['gameshot'], ['and'], ['leg_1']])
    const second = game({ ...leg, firstTo: 3, legs: [0, 1] })
    expect(callsFor(game({ ...before, firstTo: 3, legs: [0, 1] }), second)).toEqual([['gameshot'], ['and'], ['leg_2']])
    const match = game({ ...leg, legs: [1, 1] })
    expect(callsFor(game({ ...before, legs: [1, 1] }), match)).toEqual([['matchshot', 'gameshot']])
  })

  it('teams count legs per team', () => {
    const teams = [
      { id: 'A' as const, name: 'Team A', seats: [0, 2], score: 0, legs: 1 },
      { id: 'B' as const, name: 'Team B', seats: [1, 3], score: 101, legs: 0 },
    ]
    const before = game({
      scores: [40, 101, 40, 101],
      legs: [1, 0, 1, 0],
      currentPlayer: 2,
      currentVisitDarts: [],
      totalVisits: [3, 3, 2, 2],
      teams: teams.map(t => ({ ...t, score: t.id === 'A' ? 40 : 101 })),
    })
    const after = game({ ...before, scores: [0, 101, 0, 101], visitLocked: true, currentVisitDarts: [dart(40)], teams })
    expect(callsFor(before, after)).toEqual([['matchshot', 'gameshot']])
    // First to 3: Team A's checkout wins the second leg, not the third
    expect(callsFor({ ...before, firstTo: 3 }, { ...after, firstTo: 3 })).toEqual([['gameshot'], ['and'], ['leg_2']])
  })

  it('an undo that reopens a visit says nothing; the visit is called again when it ends again', () => {
    const three = game({ scores: [321, 501], currentVisitDarts: [dart(60), dart(60), dart(60)] })
    const undone = game({ scores: [381, 501], currentVisitDarts: [dart(60), dart(60)] })
    expect(callsFor(three, undone)).toEqual([])
    const again = game({ scores: [362, 501], currentVisitDarts: [dart(60), dart(60), dart(19)] })
    expect(callsFor(undone, again)).toEqual([['139']])
  })

  it('double in: calls what the visit scored, not the dart faces; nothing counted is 0', () => {
    // T20, 5 before checking in score nothing; D10 checks in for 20
    const two = game({ scores: [501, 501], currentVisitDarts: [dart(60), dart(5)] })
    const three = game({ scores: [481, 501], currentVisitDarts: [dart(60), dart(5), dart(20)] })
    expect(callsFor(two, three)).toEqual([['20']])
    const none = game({ scores: [501, 501], currentVisitDarts: [dart(60), dart(5), dart(19)] })
    expect(callsFor(two, none)).toEqual([['0']])
    // a short visit called at the next player: before is the last snapshot of the visit
    const short = game({ scores: [501, 501], currentVisitDarts: [dart(57)] })
    expect(callsFor(short, game({ currentPlayer: 1, totalVisits: [1, 0] }))).toEqual([['0']])
  })

  it('master in: a treble checks in, singles before it score nothing', () => {
    const two = game({ scores: [501, 501], currentVisitDarts: [dart(20), dart(19)] })
    const three = game({ scores: [441, 501], currentVisitDarts: [dart(20), dart(19), dart(60)] })
    expect(callsFor(two, three)).toEqual([['60']])
  })

  it('teams: calls what the current seat took off its team score', () => {
    const base = { legs: [0, 0, 0, 0], currentPlayer: 2, totalVisits: [1, 1, 0, 0], visitStartScores: [461, 501, 461, 501] }
    const two = game({ ...base, scores: [461, 501, 461, 501], currentVisitDarts: [dart(60), dart(5)] })
    const three = game({ ...base, scores: [441, 501, 441, 501], currentVisitDarts: [dart(60), dart(5), dart(20)] })
    expect(callsFor(two, three)).toEqual([['20']])
  })

  it('game on after the bull off, and at a pristine start; bull off start', () => {
    expect(callsFor(game({ phase: 'bulloff' }), game())).toEqual([['gameon']])
    expect(callsFor(null, game())).toEqual([['gameon']])
    expect(callsFor(null, game({ phase: 'bulloff' }))).toEqual([['bulling_start']])
  })

  it('first snapshot mid-game says nothing', () => {
    expect(callsFor(null, game({ scores: [321, 441], totalVisits: [2, 1], currentVisitDarts: [dart(60)] }))).toEqual([])
  })

  it('identical snapshots say nothing', () => {
    const g = game({ scores: [321, 501], currentVisitDarts: [dart(60), dart(60), dart(60)] })
    expect(callsFor(g, { ...g })).toEqual([])
  })

  it('a correction in a visit that is already over changes the call if the result differs', () => {
    // (a) 3 darts T20,T20,T20 (180 called) then the 3rd corrected to S20 → [['140']]
    const three180 = game({ scores: [321, 501], currentVisitDarts: [dart(60), dart(60), dart(60)] })
    const three140 = game({ scores: [361, 501], currentVisitDarts: [dart(60), dart(60), dart(20)] })
    expect(callsFor(three180, three140)).toEqual([['140']])

    // (b) a correction that leaves the total the same → []
    const three180a = game({ scores: [321, 501], currentVisitDarts: [dart(60), dart(60), dart(60)] })
    const three180b = game({ scores: [321, 501], currentVisitDarts: [dart(100), dart(40), dart(40)] })
    expect(callsFor(three180a, three180b)).toEqual([])

    // (c) a locked bust corrected into a non-bust 3-dart visit → the new total
    const bust = game({ scores: [32, 501], currentVisitDarts: [dart(20), dart(13)], visitLocked: true, bustThisVisit: true })
    const notBust = game({
      scores: [448, 501],
      currentVisitDarts: [dart(20), dart(13), dart(20)],
      visitLocked: false,
      bustThisVisit: false,
    })
    expect(callsFor(bust, notBust)).toEqual([['53']])

    // (d) the existing "identical snapshots say nothing" still passes (re-check with correction context)
    const g = game({ scores: [321, 501], currentVisitDarts: [dart(60), dart(60), dart(60)] })
    expect(callsFor(g, { ...g })).toEqual([])
  })
})

describe('pickClips', () => {
  const clips = { '180': ['a', 'b'], gameshot: ['g'] }
  it('picks one variant per part', () => {
    expect(pickClips([['180']], clips, () => 1)).toEqual(['b'])
  })
  it('missing keys fall back or are skipped', () => {
    expect(pickClips([['matchshot', 'gameshot']], clips, () => 0)).toEqual(['g'])
    expect(pickClips([['gameshot'], ['and'], ['leg_2']], clips, () => 0)).toEqual(['g'])
    expect(pickClips([['busted']], clips, () => 0)).toEqual([])
  })

  describe('pickClips with phrases', () => {
    const first = () => 0
    it('plays the first choice the voice has; a phrase only when it has every key', () => {
      const call = [['require_121', ['you_require', '121']]]
      expect(pickClips(call, { require_121: ['r'], you_require: ['y'], '121': ['n'] }, first)).toEqual(['r'])
      expect(pickClips(call, { you_require: ['y'], '121': ['n'] }, first)).toEqual(['y', 'n'])
      expect(pickClips(call, { you_require: ['y'] }, first)).toEqual([])
    })
  })
})
