import { describe, it, expect } from 'vitest'
import { callsFor, callGame, pickClips, checkoutFor, legPart, requirePart, createCheckoutMemory, type CallGame } from '../caller/calls.js'
import type { Snapshot } from '../api/game-ws.js'

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
  config: { outMode: 'double', startScore: 501, inMode: 'straight', botSpeed: 'normal' },
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

  it('a bust prefers busted, falling back to the voice’s own No score clip', () => {
    const before = game({ scores: [32, 501], currentVisitDarts: [dart(20)] })
    const after = game({ scores: [32, 501], currentVisitDarts: [dart(20), dart(13)], visitLocked: true, bustThisVisit: true })
    expect(callsFor(before, after)).toEqual([['busted', '0']])
  })

  it('a checkout says game shot and the leg just won; the last leg says match shot', () => {
    const before = game({ scores: [40, 501], currentVisitDarts: [dart(0)] })
    const leg = game({ scores: [0, 501], currentVisitDarts: [dart(0), dart(40)], visitLocked: true })
    expect(callsFor(before, leg)).toEqual([legPart(1)])
    const second = game({ ...leg, firstTo: 3, legs: [0, 1] })
    expect(callsFor(game({ ...before, firstTo: 3, legs: [0, 1] }), second)).toEqual([legPart(2)])
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
    expect(callsFor({ ...before, firstTo: 3 }, { ...after, firstTo: 3 })).toEqual([legPart(2)])
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
    expect(pickClips([legPart(2)], clips, () => 0)).toEqual(['g'])
    expect(pickClips([['busted']], clips, () => 0)).toEqual([])
  })

  it('a leg call prefers its own clip, then stitches what the voice has', () => {
    const first = () => 0
    const all = { gameshot_leg_2: ['own'], gameshot: ['g'], and: ['a'], leg_2: ['l'] }
    expect(pickClips([legPart(2)], all, first)).toEqual(['own'])
    expect(pickClips([legPart(2)], { gameshot: ['g'], and: ['a'], leg_2: ['l'] }, first)).toEqual(['g', 'a', 'l'])
    expect(pickClips([legPart(2)], { gameshot: ['g'], leg_2: ['l'] }, first)).toEqual(['g', 'l'])
    expect(pickClips([legPart(2)], { gameshot: ['g'], and: ['a'] }, first)).toEqual(['g'])
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

describe('checkoutFor', () => {
  const three = [dart(60), dart(60), dart(60)]
  // Seat 0's visit over (three darts), then the takeout hands the turn to seat 1
  const over = (o: Partial<CallGame> = {}) => game({ scores: [141, 121], currentVisitDarts: three, ...o })
  const next = (o: Partial<CallGame> = {}) => game({ scores: [141, 121], currentPlayer: 1, totalVisits: [1, 0], ...o })

  it('names what the next thrower needs when they can finish', () => {
    expect(checkoutFor(over(), next())).toEqual({ seat: 1, remaining: 121, leg: 0 })
  })

  it("says nothing for a score that can't be finished, or before a visit is committed", () => {
    expect(checkoutFor(over({ scores: [141, 169] }), next({ scores: [141, 169] }))).toBeNull()
    expect(checkoutFor(game({ scores: [381, 121], currentVisitDarts: [dart(60)] }), over())).toBeNull()
  })

  it('follows the out mode: 180 finishes in straight out', () => {
    const config = { outMode: 'straight' as const, startScore: 501, inMode: 'straight' as const, botSpeed: 'normal' as const }
    expect(checkoutFor(over({ scores: [141, 180], config }), next({ scores: [141, 180], config }))).toEqual({
      seat: 1,
      remaining: 180,
      leg: 0,
    })
  })

  it('not at a new leg, not mid-game on open, not on an undo', () => {
    expect(checkoutFor(over(), next({ legs: [1, 0] }))).toBeNull()
    expect(checkoutFor(null, next())).toBeNull()
    expect(checkoutFor(next(), over({ totalVisits: [0, 0] }))).toBeNull()
  })

  it("uses the team's score in team games", () => {
    const teams = [
      { id: 'A' as const, name: 'A', seats: [0, 2], score: 141, legs: 0 },
      { id: 'B' as const, name: 'B', seats: [1, 3], score: 40, legs: 0 },
    ]
    const before = over({ scores: [141, 501, 141, 501], visitStartScores: [501, 501, 501, 501], totalVisits: [0, 0, 0, 0], teams })
    const after = next({ scores: [141, 501, 141, 501], visitStartScores: [501, 501, 501, 501], totalVisits: [1, 0, 0, 0], teams })
    expect(checkoutFor(before, after)).toEqual({ seat: 1, remaining: 40, leg: 0 })
  })
})

describe('requirePart', () => {
  it('the whole phrase, else the lead-in and the number', () => {
    expect(requirePart(121)).toEqual(['require_121', ['you_require', '121']])
  })
})

describe('createCheckoutMemory', () => {
  it('without repeat, skips the same score for the same seat until the next leg', () => {
    const say = createCheckoutMemory()
    expect(say({ seat: 1, remaining: 121, leg: 0 }, false)).toBe(true)
    expect(say({ seat: 1, remaining: 121, leg: 0 }, false)).toBe(false)
    expect(say({ seat: 0, remaining: 121, leg: 0 }, false)).toBe(true)
    expect(say({ seat: 1, remaining: 80, leg: 0 }, false)).toBe(true)
    expect(say({ seat: 1, remaining: 121, leg: 1 }, false)).toBe(true)
  })

  it('with repeat, always says it', () => {
    const say = createCheckoutMemory()
    expect(say({ seat: 1, remaining: 121, leg: 0 }, true)).toBe(true)
    expect(say({ seat: 1, remaining: 121, leg: 0 }, true)).toBe(true)
  })
})

// Only the fields the caller reads; the rest of a snapshot doesn't matter to it
const snap = (gameId: Snapshot['gameId'], g: Record<string, unknown>) =>
  ({
    gameId,
    game: { phase: 'game', currentPlayer: 0, visitLocked: false, currentVisitDarts: [], totalVisits: [0, 0], ...g },
  }) as unknown as Snapshot

describe('callGame: 121 Checkout', () => {
  const seats = (left: number, other = 121) => [{ left }, { left: other }]
  const p121 = (o: Record<string, unknown>) =>
    callGame(snap('p121', { cfg: { outMode: 'double' }, bust: false, visitStartLeft: 121, seats: seats(121), ...o }))!

  it('calls what the visit took off the target, at the third dart', () => {
    const two = p121({ seats: seats(61), currentVisitDarts: [dart(60), dart(0)] })
    const three = p121({ seats: seats(41), currentVisitDarts: [dart(60), dart(0), dart(20)] })
    expect(callsFor(two, three)).toEqual([['80']])
  })

  it('calls a bust, and a checkout as game shot', () => {
    const before = p121({ seats: seats(21), currentVisitDarts: [dart(60), dart(40)] })
    const bust = p121({ seats: seats(21), currentVisitDarts: [dart(60), dart(40), dart(20)], bust: true, visitLocked: true })
    expect(callsFor(before, bust)).toEqual([['busted', '0']])
    const made = p121({ seats: seats(0), currentVisitDarts: [dart(60), dart(40), dart(21)], visitLocked: true })
    expect(callsFor(before, made)).toEqual([['gameshot']])
  })

  it('says what the next thrower needs at the takeout', () => {
    const open = p121({ seats: seats(41), currentVisitDarts: [dart(60), dart(0), dart(20)] })
    const next = p121({ seats: seats(41, 40), visitStartLeft: 40, currentPlayer: 1, totalVisits: [1, 0] })
    expect(checkoutFor(open, next)).toEqual({ seat: 1, remaining: 40, leg: 0 })
  })
})

describe('callGame: Higher Lower', () => {
  const hilo = (o: Record<string, unknown>) => callGame(snap('hilo', { visitTotal: 0, ...o }))!

  it('calls the visit total at the third dart, and never a checkout', () => {
    const two = hilo({ visitTotal: 25, currentVisitDarts: [dart(20), dart(5)] })
    const three = hilo({ visitTotal: 45, currentVisitDarts: [dart(20), dart(5), dart(20)] })
    expect(callsFor(two, three)).toEqual([['45']])
    expect(checkoutFor(three, hilo({ visitTotal: 0, currentPlayer: 1, totalVisits: [1, 0] }))).toBeNull()
  })

  it('calls a visit ended by a miss as busted', () => {
    const one = hilo({ visitTotal: 20, currentVisitDarts: [dart(20)] })
    const missed = hilo({ visitTotal: 20, currentVisitDarts: [dart(20), dart(0)], visitLocked: true })
    expect(callsFor(one, missed)).toEqual([['busted', '0']])
  })
})

describe('callGame', () => {
  it('has no score to call in Around the Clock or minigolf', () => {
    expect(callGame(snap('atc', {}))).toBeNull()
    expect(callGame(snap('minigolf', {}))).toBeNull()
  })
})
