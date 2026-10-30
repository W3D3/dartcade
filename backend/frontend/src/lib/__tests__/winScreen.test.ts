import { describe, it, expect } from 'vitest'
import { sharedBoard, winMeta, winView } from '../winScreen.js'
import type { CricketGame, GameDetail, HiloGame, Snapshot, StatRow } from '../api'

const seat = (o: { userId?: string | null; boardName?: string | null; forfeited?: boolean } = {}) => ({
  controllerUserId: 'u1',
  userId: o.userId === undefined ? 'u1' : o.userId,
  avatar: { kind: 'none' as const },
  boardId: 'b1',
  boardName: o.boardName === undefined ? 'Living room' : o.boardName,
  boardOnline: true,
  controllerConnected: true,
  disconnectedAt: null,
  forfeited: o.forfeited ?? false,
  bot: null,
})

function x01(o: { players?: string[]; game?: Record<string, unknown>; guests?: number[]; places?: number[] } = {}): Snapshot {
  const names = o.players ?? ['Christoph', 'Guest 1']
  const n = names.length
  return {
    type: 'snapshot',
    sessionId: 's1',
    gameId: 'x01',
    boardId: 'b1',
    lobbyId: 'l1',
    lobbyName: 'Friday darts',
    players: names.map(name => ({ name })),
    game: {
      scores: [0, 75, 152, 245].slice(0, n),
      legs: [3, 1, 0, 0].slice(0, n),
      firstTo: 3,
      currentPlayer: 0,
      nextPlayer: null,
      round: 20,
      phase: 'finished',
      winner: 0,
      opened: names.map(() => true),
      bustThisVisit: false,
      config: { outMode: 'double', inMode: 'straight', startScore: 501 },
      visitLocked: true,
      currentVisitDarts: [],
      totalDarts: [66, 65, 60, 60].slice(0, n),
      totalVisits: [22, 22, 20, 20].slice(0, n),
      ...o.game,
    },
    bmStatus: null,
    status: 'finished',
    // The server's places (results() in replay.ts)
    results: names.map((_, i) => ({ placement: o.places?.[i] ?? i + 1, forfeited: false })),
    finishPending: false,
    canUndoVisit: false,
    ownerUserId: 'u1',
    seats: names.map((_, i) => seat({ userId: o.guests?.includes(i) ? null : `u${i + 1}` })),
    mySeats: [0],
  } as unknown as Snapshot
}

const dart = (name: string, index = 0) => ({
  index,
  segment: { name, number: 0, bed: 'Single', multiplier: 1 },
  coords: null,
  source: 'camera',
  corrected: false,
  thrownAt: '',
})
const visit = (seat: number, darts: string[], scored: number, remaining: number) => ({
  visit: 0,
  seat,
  committedAt: '',
  darts: darts.map(dart),
  scored,
  remaining,
  bust: false,
})

// The details page's X01 rows, as the server sends them (x01Stats.ts)
const statRows: StatRow[] = [
  { key: 'average', label: '3-dart average', format: 'decimal', better: 'higher', compact: false },
  { key: 'first9Average', label: 'First 9 average', format: 'decimal', better: 'higher', compact: true },
  { key: 'checkout', label: 'Checkout', format: 'ratio', better: 'higher', compact: true, value: 'checkoutHits', of: 'checkoutAttempts' },
  { key: 'highestFinish', label: 'Highest finish', format: 'integer', better: 'higher', compact: true },
  { key: 'count180', label: '180s', format: 'integer', better: 'higher', compact: false },
  { key: 'count140', label: '140+', format: 'integer', better: 'higher', compact: false },
  { key: 'bestLegDarts', label: 'Best leg', format: 'darts', better: 'lower', compact: true },
  { key: 'dartsThrown', label: 'Darts thrown', format: 'integer', better: null, compact: true },
]

// Christoph wins 3–1: legs 1, 3 and 4 his (leg 4 checked out 75 with T17 · D12), leg 2 Guest 1's
const detail = (): GameDetail =>
  ({
    game: {
      id: 's1',
      mode: 'x01',
      config: {},
      createdAt: '',
      finishedAt: '',
      board: null,
      mySeat: 0,
      players: [
        {
          seat: 0,
          name: 'Christoph',
          userId: 'u1',
          placement: 1,
          throwPosition: 0,
          forfeited: false,
          stats: { average: 83.9, dartsThrown: 66, legsWon: 3, pointsScored: 1846, bestCheckout: 116 },
        },
        {
          seat: 1,
          name: 'Guest 1',
          userId: null,
          placement: 2,
          throwPosition: 1,
          forfeited: false,
          stats: { average: 71.6, dartsThrown: 65, legsWon: 1, pointsScored: 1551.33, bestCheckout: 60 },
        },
      ],
    },
    detail: {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: 0,
          visits: [visit(0, ['T20', 'T20', 'T20'], 180, 321), visit(1, ['S20', 'S20', 'S20'], 60, 441), visit(0, ['D15'], 30, 0)],
        },
        { leg: 1, starter: 1, winner: 1, visits: [visit(1, ['S20', 'D20'], 60, 0)] },
        { leg: 2, starter: 0, winner: 0, visits: [visit(0, ['T20', 'S20', 'D18'], 116, 0)] },
        {
          leg: 3,
          starter: 1,
          winner: 0,
          visits: [visit(1, ['S1', 'S1', 'S1'], 3, 498), visit(0, ['T20', 'T20', 'T20'], 180, 75), visit(0, ['T17', 'D12'], 75, 0)],
        },
      ],
    },
    stats: {
      rows: statRows,
      seats: [
        {
          index: 0,
          values: {
            average: 83.9,
            first9Average: 86.4,
            checkoutHits: 3,
            checkoutAttempts: 6,
            highestFinish: 116,
            count180: 2,
            count140: 3,
            bestLegDarts: 15,
            dartsThrown: 66,
          },
        },
        {
          index: 1,
          values: {
            average: 71.6,
            first9Average: 80.7,
            checkoutHits: 1,
            checkoutAttempts: 4,
            highestFinish: 60,
            count180: 0,
            count140: 1,
            bestLegDarts: 17,
            dartsThrown: 65,
          },
        },
      ],
    },
  }) as unknown as GameDetail

describe('winView', () => {
  it('is null before anyone has won', () => {
    expect(winView(x01({ game: { winner: null } }), null)).toBeNull()
    // A winning visit waiting for Finish game: the match screen stays
    expect(winView({ ...x01(), status: 'active' }, null)).toBeNull()
    expect(winView(null, null)).toBeNull()
  })

  it('X01 duel: the winner first, the legs score, and the stats from the saved game', () => {
    const v = winView(x01({ guests: [1] }), detail())!
    expect(v.layout).toBe('duel')
    expect(v.competitors.map(c => [c.name, c.placement, c.score, c.face?.userId === null])).toEqual([
      ['Christoph', 1, 3, false],
      ['Guest 1', 2, 1, true],
    ])
    expect(v.competitors[0].sub).toBe('83.9 avg · 66 darts')
    expect(v.scoreLabel).toBe('Legs · first to 3')
    // The details page's rows but 140+ and darts thrown, as the Win-Duel artboard lists them
    expect(v.stats).toEqual([
      { label: '3-dart average', values: ['83.9', '71.6'], share: expect.closeTo(0.54, 2) },
      { label: 'First 9 average', values: ['86.4', '80.7'], share: expect.closeTo(0.52, 2) },
      { label: 'Checkout', values: ['50% · 3/6', '25% · 1/4'], share: expect.closeTo(0.67, 2) },
      { label: 'Highest finish', values: ['116', '60'], share: expect.closeTo(0.66, 2) },
      { label: '180s', values: ['2', '0'], share: 1 },
      // Fewer darts is better: the bar leans to the winner's 15
      { label: 'Best leg', values: ['15 darts', '17 darts'], share: expect.closeTo(0.53, 2) },
    ])
    // Cricket's own marks table; every other mode carries nothing here
    expect(v.cricketMarks).toBeUndefined()
  })

  it('X01 duel: a dash and a full bar when the runner-up never finished a leg', () => {
    const d = detail()
    d.stats.seats[1].values = { average: 40.2, checkoutHits: 0, checkoutAttempts: 0, dartsThrown: 30 }
    const v = winView(x01(), d)!
    const row = (label: string) => v.stats.find(s => s.label === label)
    expect(row('Best leg')).toEqual({ label: 'Best leg', values: ['15 darts', '—'], share: 1 })
    expect(row('Highest finish')?.values).toEqual(['116', '—'])
    expect(row('Checkout')?.values).toEqual(['50% · 3/6', '—'])
  })

  it('X01: the final checkout and every leg, with the darts the leg took its winner', () => {
    const v = winView(x01({ guests: [1] }), detail())!
    expect(v.checkout).toEqual({ name: 'Christoph', left: 75, darts: 'T17 · D12', tail: 'to take leg 4 in 5 darts.' })
    expect(v.legs).toEqual([
      { n: 1, name: 'Christoph', face: expect.any(Object), byWinner: true, text: '4 darts · D15' },
      { n: 2, name: 'Guest 1', face: expect.any(Object), byWinner: false, text: '2 darts · S20 · D20' },
      { n: 3, name: 'Christoph', face: expect.any(Object), byWinner: true, text: '3 darts · T20 · S20 · D18' },
      { n: 4, name: 'Christoph', face: expect.any(Object), byWinner: true, text: '5 darts · T17 · D12' },
    ])
  })

  it('X01 before the saved game loads: placements and legs from the snapshot, no averages', () => {
    const v = winView(x01(), null)!
    expect(v.competitors.map(c => c.sub)).toEqual(['66 darts', '65 darts'])
    expect(v.stats).toEqual([])
    expect(v.legs).toEqual([])
    expect(v.checkout).toBeNull()
  })

  it('X01 party: the rest ranked by legs, then by points left', () => {
    const v = winView(
      x01({
        players: ['Christoph', 'Lena', 'Guest 1', 'Max'],
        game: { legs: [3, 1, 0, 0], scores: [0, 32, 245, 152] },
        places: [1, 2, 4, 3],
      }),
      null,
    )!
    expect(v.layout).toBe('party')
    expect(v.competitors.map(c => [c.name, c.placement])).toEqual([
      ['Christoph', 1],
      ['Lena', 2],
      ['Max', 3],
      ['Guest 1', 4],
    ])
    expect(v.kicker).toBe('Game shot · leg 4')
    expect(v.note).toBe("3 legs to Lena's 1 · the rest ranked by legs, then by points left in the last leg")
    expect(v.columns).toEqual(['Legs', 'Avg', 'First 9'])
    expect(v.stats).toEqual([])
  })

  it('X01 party: average and first 9 per player from the saved game', () => {
    const d = detail()
    d.stats.seats = [86.4, 80.7, 60.1, 45.2].map((first9Average, index) => ({ index, values: { average: 70 - index, first9Average } }))
    const v = winView(x01({ players: ['Christoph', 'Lena', 'Guest 1', 'Max'] }), d)!
    expect(v.competitors.map(c => [c.name, c.cells])).toEqual([
      ['Christoph', ['3', '70.0', '86.4']],
      ['Lena', ['1', '69.0', '80.7']],
      ['Guest 1', ['0', '68.0', '60.1']],
      ['Max', ['0', '67.0', '45.2']],
    ])
  })

  it('X01 teams: a side per team, named after it', () => {
    const v = winView(
      x01({
        players: ['Christoph', 'Lena', 'Guest 1', 'Max'],
        game: {
          winner: 2,
          legs: [1, 2, 1, 2],
          scores: [40, 0, 40, 0],
          teams: [
            { id: 'A', name: 'Team A', seats: [0, 2], score: 40, legs: 1 },
            { id: 'B', name: 'Team B', seats: [1, 3], score: 0, legs: 2 },
          ],
        },
      }),
      null,
    )!
    expect(v.layout).toBe('duel')
    expect(v.competitors.map(c => [c.name, c.members, c.placement])).toEqual([
      ['Team A', ['Christoph', 'Guest 1'], 1],
      ['Team B', ['Lena', 'Max'], 2],
    ])
  })

  it("X01 teams: the stats are each team's, not a player's", () => {
    const d = detail()
    d.game.players = []
    d.stats.teams = [
      { index: 0, values: { average: 64.5, first9Average: 70.2 } },
      { index: 1, values: { average: 58.1, first9Average: 61.9 } },
    ]
    const v = winView(
      x01({
        players: ['Christoph', 'Lena', 'Guest 1', 'Max'],
        game: {
          winner: 0,
          legs: [3, 1, 3, 1],
          teams: [
            { id: 'A', name: 'Team A', seats: [0, 2], score: 0, legs: 3 },
            { id: 'B', name: 'Team B', seats: [1, 3], score: 40, legs: 1 },
          ],
        },
      }),
      d,
    )!
    expect(v.competitors[0].sub).toBe('64.5 avg · 126 darts')
    expect(v.stats.slice(0, 2).map(s => s.values)).toEqual([
      ['64.5', '58.1'],
      ['70.2', '61.9'],
    ])
  })

  it('Around the Clock: targets done, darts and hit rate from the snapshot', () => {
    const snap = {
      ...x01(),
      gameId: 'atc',
      game: {
        targets: [22, 15],
        sequence: Array.from({ length: 21 }, (_, i) => i + 1),
        currentPlayer: 0,
        winner: 0,
        cfg: { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false, order: 'asc' },
        currentVisitHits: [],
        hitCounts: [21, 14],
        currentVisitDarts: [],
        totalDarts: [42, 42],
        totalVisits: [14, 14],
      },
    } as unknown as Snapshot
    const v = winView(snap, null)!
    expect(v.competitors.map(c => [c.name, c.score, c.cells])).toEqual([
      ['Christoph', 21, ['21', '42', '50%']],
      ['Guest 1', 14, ['14', '42', '33%']],
    ])
    expect(v.scoreLabel).toBe('Targets · of 21')
    expect(v.stats.map(s => s.label)).toEqual(['Targets done', 'Darts thrown', 'Hit rate'])
  })
})

describe('winMeta / sharedBoard', () => {
  it('names the rules, and both players in a duel', () => {
    expect(winMeta(x01())).toBe('501 · Double out · First to 3 legs · Christoph vs Guest 1')
    expect(winMeta(x01({ players: ['A', 'B', 'C'] }))).toBe('3 players · 501 · Double out · First to 3 legs')
  })

  it('names the board only when everyone threw on it', () => {
    expect(sharedBoard(x01())).toBe('Living room')
    const s = x01()
    s.seats[1] = seat({ boardName: "Lena's place" })
    expect(sharedBoard(s)).toBeNull()
  })
})

// A Higher Lower visit: round, total and outcome.
const hv = (round: number, total: number, outcome: 'high' | 'low' | 'between' | 'miss') => ({ round, total, outcome })
type HiloSeatFixture = {
  lives: number
  out?: boolean
  place: number | null
  outRound?: number | null
  visits?: ReturnType<typeof hv>[]
  forfeited?: boolean
}

function hilo(
  players: string[],
  seats: HiloSeatFixture[],
  winner: number | null,
  o: { guests?: number[]; places?: number[] } = {},
): Snapshot & { game: HiloGame } {
  return {
    type: 'snapshot',
    sessionId: 's1',
    gameId: 'hilo',
    boardId: 'b1',
    lobbyId: null,
    lobbyName: null,
    players: players.map(name => ({ name })),
    game: {
      cfg: { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: true },
      phase: winner === null ? 'game' : 'finished',
      high: 41,
      low: 21,
      round: 5,
      currentPlayer: 0,
      nextPlayer: null,
      winner,
      visitLocked: false,
      visitTotal: 0,
      seats: seats.map(s => ({
        lives: s.lives,
        out: s.out ?? false,
        place: s.place,
        outRound: s.outRound ?? null,
        visits: s.visits ?? [],
      })),
      lastResult: null,
      bullOff: null,
      currentVisitDarts: [],
      totalDarts: seats.map(() => 0),
      totalVisits: seats.map(() => 0),
    },
    bmStatus: null,
    status: 'finished',
    results: players.map((_, i) => ({ placement: o.places?.[i] ?? seats[i]?.place ?? i + 1, forfeited: seats[i]?.forfeited ?? false })),
    finishPending: false,
    canUndoVisit: false,
    ownerUserId: 'u1',
    seats: players.map((_, i) => seat({ userId: o.guests?.includes(i) ? null : `u${i + 1}`, forfeited: seats[i]?.forfeited ?? false })),
    mySeats: [0],
  } as unknown as Snapshot & { game: HiloGame }
}

describe('hiloWin', () => {
  it('duel: the winner first, lives left, bars moved and lives lost to misses', () => {
    const snap = hilo(
      ['Christoph', 'Guest 1'],
      [
        { lives: 2, place: 1, visits: [hv(1, 45, 'high'), hv(2, 15, 'low'), hv(3, 10, 'between')] },
        {
          lives: 0,
          out: true,
          place: 2,
          outRound: 4,
          visits: [hv(1, 60, 'high'), hv(2, 5, 'miss'), hv(3, 30, 'between'), hv(4, 35, 'between')],
        },
      ],
      0,
      { guests: [1] },
    )
    const v = winView(snap, null)!
    expect(v.mode).toBe('hilo')
    expect(v.layout).toBe('duel')
    expect(v.kicker).toBe('Last one standing')
    expect(v.scoreLabel).toBe('Lives left')
    expect(v.competitors.map(c => [c.name, c.placement, c.score, c.face?.userId === null, c.sub, c.cells])).toEqual([
      ['Christoph', 1, 2, false, '2 lives left', ['2', '2', '–']],
      ['Guest 1', 2, 0, true, 'Out in round 4', ['0', '1', '4']],
    ])
    expect(v.stats).toEqual([
      { label: 'Lives left', values: ['2', '0'], share: 1 },
      { label: 'Bars moved', values: ['2', '1'], share: expect.closeTo(0.667, 2) },
      { label: 'Lives lost to misses', values: ['0', '1'], share: 0 },
    ])
    expect(v.highlights).toEqual([
      { name: 'Guest 1', face: expect.any(Object), label: 'Highest bar', text: 'Set HIGH 60.' },
      { name: 'Christoph', face: expect.any(Object), label: 'Lowest bar', text: 'Set LOW 15.' },
    ])
    expect(v.checkout).toBeNull()
    expect(v.legs).toEqual([])
    expect(v.columns).toEqual(['Lives', 'Bars moved', 'Out in'])
    expect(v.cricketMarks).toBeUndefined()
  })

  it('party: placed by place, highest and lowest bar set across everyone', () => {
    const snap = hilo(
      ['Christoph', 'Lena', 'Guest 1', 'Max'],
      [
        { lives: 1, place: 1, visits: [hv(1, 70, 'high')] },
        { lives: 0, out: true, place: 2, outRound: 5, visits: [hv(1, 10, 'low'), hv(5, 33, 'between')] },
        { lives: 0, out: true, place: 4, outRound: 2, visits: [hv(2, 5, 'miss')] },
        { lives: 0, out: true, place: 3, outRound: 3, visits: [hv(3, 62, 'high')] },
      ],
      0,
      { guests: [2] },
    )
    const v = winView(snap, null)!
    expect(v.layout).toBe('party')
    expect(v.competitors.map(c => [c.name, c.placement, c.sub, c.cells])).toEqual([
      ['Christoph', 1, '1 life left', ['1', '1', '–']],
      ['Lena', 2, 'Out in round 5', ['0', '1', '5']],
      ['Max', 3, 'Out in round 3', ['0', '1', '3']],
      ['Guest 1', 4, 'Out in round 2', ['0', '0', '2']],
    ])
    expect(v.highlights).toEqual([
      { name: 'Christoph', face: expect.any(Object), label: 'Highest bar', text: 'Set HIGH 70.' },
      { name: 'Lena', face: expect.any(Object), label: 'Lowest bar', text: 'Set LOW 10.' },
    ])
  })

  it('a forfeit: the forfeited seat ranks last even with more lives left, winner null', () => {
    const snap = hilo(
      ['Christoph', 'Guest 1'],
      [
        { lives: 1, place: null },
        { lives: 3, place: null, forfeited: true },
      ],
      null,
      { guests: [1] },
    )
    expect(snap.game.winner).toBeNull()
    const v = winView(snap, null)!
    expect(v).not.toBeNull()
    expect(v.competitors.map(c => [c.name, c.placement, c.score, c.sub])).toEqual([
      ['Christoph', 1, 1, '1 life left'],
      ['Guest 1', 2, 3, 'Forfeited'],
    ])
  })

  it("a 3+ player forfeit: follows the server's places, a seat still in ahead of one already out", () => {
    const snap = hilo(
      ['A', 'B', 'C'],
      [
        { lives: 3, place: null },
        { lives: 0, out: true, place: 3, outRound: 2 },
        { lives: 1, place: null, forfeited: true },
      ],
      null,
      { places: [1, 2, 3] },
    )
    const v = winView(snap, null)!
    expect(v.competitors.map(c => [c.name, c.placement])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ])
  })

  it('a forfeit among seats tied on lives: the tie stands, the forfeit still ranks last', () => {
    const snap = hilo(
      ['Mia', 'Noah', 'Ivy'],
      [
        { lives: 2, place: null },
        { lives: 2, place: null },
        { lives: 1, place: null, forfeited: true },
      ],
      null,
      { places: [1, 1, 3] },
    )
    const v = winView(snap, null)!
    expect(v.competitors.map(c => [c.name, c.placement])).toEqual([
      ['Mia', 1],
      ['Noah', 1],
      ['Ivy', 3],
    ])
  })

  it('names the rules, and both players in a duel', () => {
    const snap = hilo(
      ['Christoph', 'Guest 1'],
      [
        { lives: 2, place: 1 },
        { lives: 0, out: true, place: 2, outRound: 2 },
      ],
      0,
    )
    expect(winMeta(snap)).toBe('41 / 21 · 3 lives · Christoph vs Guest 1')
  })
})

type CricketFixture = {
  mode?: 'standard' | 'cutthroat'
  firstTo?: number
  legs?: number[]
  points?: number[]
  marksScored?: number[]
  dartsThrown?: number[]
  winner?: number | null
  teams?: { id: 'A' | 'B'; name: string; seats: number[] }[]
  forfeited?: number[]
  guests?: number[]
  marks?: number[][]
  closed?: boolean[]
  /** The server's places per seat; seat order without */
  places?: number[]
}

function cricket(players: string[], o: CricketFixture = {}): Snapshot & { game: CricketGame } {
  const n = players.length
  const zeros = () => players.map(() => 0)
  const game: Record<string, unknown> = {
    config: { mode: o.mode ?? 'standard', firstTo: o.firstTo ?? 3, botSpeed: 'normal' },
    phase: 'finished',
    targets: [20, 19, 18, 17, 16, 15, 25],
    marks: o.marks ?? Array.from({ length: n }, () => [0, 0, 0, 0, 0, 0, 0]),
    points: o.points ?? zeros(),
    legs: o.legs ?? zeros(),
    firstTo: o.firstTo ?? 3,
    closed: o.closed ?? Array(7).fill(false),
    scorable: Array(7).fill(false),
    currentPlayer: 0,
    nextPlayer: null,
    round: 10,
    winner: o.winner ?? null,
    visitLocked: false,
    marksScored: o.marksScored ?? zeros(),
    dartsThrown: o.dartsThrown ?? zeros(),
    lastVisit: players.map(() => null),
    bullOff: null,
    currentVisitDarts: [],
    totalDarts: zeros(),
    totalVisits: zeros(),
  }
  if (o.teams) game.teams = o.teams
  return {
    type: 'snapshot',
    sessionId: 's1',
    gameId: 'cricket',
    boardId: 'b1',
    lobbyId: null,
    lobbyName: null,
    players: players.map(name => ({ name })),
    game,
    bmStatus: null,
    status: 'finished',
    finishPending: false,
    canUndoVisit: false,
    ownerUserId: 'u1',
    seats: players.map((_, i) =>
      seat({ userId: o.guests?.includes(i) ? null : `u${i + 1}`, forfeited: o.forfeited?.includes(i) ?? false }),
    ),
    mySeats: [0],
    results: players.map((_, i) => ({ placement: o.places?.[i] ?? i + 1, forfeited: o.forfeited?.includes(i) ?? false })),
  } as unknown as Snapshot & { game: CricketGame }
}

describe('cricketWin', () => {
  it('duel: the winner first, MPR/points/legs cells, and the three duel stats', () => {
    const marks = [
      [3, 3, 3, 3, 3, 3, 3],
      [3, 3, 3, 2, 0, 1, 0],
    ]
    const closed = [true, true, true, false, false, false, false]
    const snap = cricket(['Christoph', 'Guest 1'], {
      winner: 0,
      legs: [3, 1],
      points: [366, 242],
      marksScored: [60, 45],
      dartsThrown: [60, 75],
      guests: [1],
      marks,
      closed,
    })
    const v = winView(snap, null)!
    expect(v.mode).toBe('cricket')
    expect(v.layout).toBe('duel')
    expect(v.kicker).toBe('Cricket')
    expect(v.scoreLabel).toBe('Legs')
    expect(v.columns).toEqual(['MPR', 'Points', 'Legs'])
    expect(v.competitors.map(c => [c.name, c.placement, c.score, c.face?.userId === null, c.sub, c.cells])).toEqual([
      ['Christoph', 1, 3, false, '3.0 MPR · 60 darts', ['3.0', '366', '3']],
      ['Guest 1', 2, 1, true, '1.8 MPR · 75 darts', ['1.8', '242', '1']],
    ])
    // firstTo is 3 here (a race), so Points is only the deciding leg's, not the match's
    expect(v.stats).toEqual([
      { label: 'MPR', values: ['3.0', '1.8'], share: expect.closeTo(0.625, 2) },
      { label: 'Points · last leg', values: ['366', '242'], share: expect.closeTo(0.602, 2) },
      { label: 'Marks', values: ['60', '45'], share: expect.closeTo(0.571, 2) },
    ])
    expect(v.checkout).toBeNull()
    expect(v.legs).toEqual([])
    // The final snapshot's own board (the reducer keeps the last leg's marks once the match
    // ends): no GameDetail needed, unlike the details page's per-leg table
    expect(v.cricketMarks?.game.marks).toEqual(marks)
    expect(v.cricketMarks?.game.closed).toEqual(closed)
    expect(v.cricketMarks?.sides.map(s => [s.seat, s.name])).toEqual([
      [0, 'Christoph'],
      [1, 'Guest 1'],
    ])
  })

  it('a single-leg duel keeps the plain Points label', () => {
    const snap = cricket(['Christoph', 'Guest 1'], {
      firstTo: 1,
      winner: 0,
      legs: [1, 0],
      points: [120, 80],
      marksScored: [30, 25],
      dartsThrown: [30, 30],
      guests: [1],
    })
    const v = winView(snap, null)!
    expect(v.stats.find(s => s.label.startsWith('Points'))?.label).toBe('Points')
  })

  it("cut-throat party: in the server's places (the winner, then the fewest points)", () => {
    const snap = cricket(['A', 'B', 'C', 'D'], {
      places: [4, 2, 1, 3],
      mode: 'cutthroat',
      firstTo: 1,
      winner: 2,
      legs: [0, 0, 1, 0],
      points: [50, 10, 999, 30],
      marksScored: [20, 30, 45, 25],
      dartsThrown: [30, 30, 30, 30],
    })
    const v = winView(snap, null)!
    expect(v.layout).toBe('party')
    expect(v.kicker).toBe('Cut-throat cricket')
    expect(v.scoreLabel).toBe('Points')
    expect(v.competitors.map(c => [c.name, c.placement, c.score, c.cells])).toEqual([
      ['C', 1, 999, ['4.5', '999', '1']],
      ['B', 2, 10, ['3.0', '10', '0']],
      ['D', 3, 30, ['2.5', '30', '0']],
      ['A', 4, 50, ['2.0', '50', '0']],
    ])
  })

  it("a forfeit: the forfeited seat, last in the server's places, says Forfeited; winner null", () => {
    const snap = cricket(['Christoph', 'Guest 1'], {
      legs: [1, 2],
      points: [100, 500],
      forfeited: [1],
      guests: [1],
    })
    expect(snap.game.winner).toBeNull()
    const v = winView(snap, null)!
    expect(v).not.toBeNull()
    expect(v.competitors.map(c => [c.name, c.placement, c.sub])).toEqual([
      ['Christoph', 1, '0.0 MPR · 0 darts'],
      ['Guest 1', 2, 'Forfeited'],
    ])
  })

  it('names the rules, and both players in a duel', () => {
    const snap = cricket(['Christoph', 'Guest 1'], { winner: 0, legs: [3, 1] })
    expect(winMeta(snap)).toBe('Standard · First to 3 · Christoph vs Guest 1')
  })
})
