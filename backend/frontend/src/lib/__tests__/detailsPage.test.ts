import { describe, it, expect } from 'vitest'
import type { GameDetail } from '../api'
import { detailSides, headline, highlightDefault, isGameDetail, layoutOf, loadPhase, metaLine } from '../details/page.js'
import { legMarksGame, playersBySeat } from '../details/cricket.js'
import { cricketSides, legNumber } from '../cricket/view.js'

const seat = (s: number, name: string, placement: number, stats: Record<string, number> = {}) => ({
  seat: s,
  throwPosition: s,
  name,
  userId: s === 0 ? 'me' : null,
  avatar: { kind: 'none' as const },
  bot: null,
  placement,
  stats,
  forfeited: false,
})
const x01 = (players: ReturnType<typeof seat>[], extra: Partial<GameDetail> = {}): GameDetail => ({
  game: {
    id: 'g1',
    mode: 'x01',
    config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
    createdAt: '2026-09-26T19:00:00.000Z',
    finishedAt: '2026-09-26T19:14:00.000Z',
    board: { id: 'b', name: 'Living room' },
    mySeat: 0,
    invalidated: false,
    players,
  },
  detail: { mode: 'x01', legs: [] },
  stats: {
    rows: [],
    seats: players.map(p => ({ index: p.seat, values: { legsWon: p.placement === 1 ? 3 : 1 } })),
  },
  ...extra,
})

const cricketDetail = (players: ReturnType<typeof seat>[], extra: Partial<GameDetail> = {}): GameDetail => ({
  game: {
    id: 'g1',
    mode: 'cricket',
    config: { mode: 'standard', firstTo: 3, botSpeed: 'normal' },
    createdAt: '2026-09-26T19:00:00.000Z',
    finishedAt: '2026-09-26T19:14:00.000Z',
    board: { id: 'b', name: 'Living room' },
    mySeat: 0,
    invalidated: false,
    players,
  },
  detail: { mode: 'cricket', targets: [20, 19, 18, 17, 16, 15, 25], legs: [] },
  stats: {
    rows: [],
    seats: players.map(p => ({ index: p.seat, values: { legsWon: p.placement === 1 ? 3 : 1 } })),
  },
  ...extra,
})

describe('details page helpers', () => {
  it('picks the layout', () => {
    expect(layoutOf(x01([seat(0, 'A', 1)]))).toBe('duel')
    expect(layoutOf(x01([seat(0, 'A', 1), seat(1, 'B', 2)]))).toBe('duel')
    expect(layoutOf(x01([seat(0, 'A', 1), seat(1, 'B', 2), seat(2, 'C', 3)]))).toBe('party')
    const teams = x01([seat(0, 'A', 1), seat(1, 'B', 2), seat(2, 'C', 1), seat(3, 'D', 2)])
    teams.stats.teams = [
      { index: 0, values: { legsWon: 2 } },
      { index: 1, values: { legsWon: 1 } },
    ]
    teams.detail = {
      mode: 'x01',
      legs: [],
      teams: [
        { id: 'A', name: 'Team A', seats: [0, 2] },
        { id: 'B', name: 'Team B', seats: [1, 3] },
      ],
    }
    expect(layoutOf(teams)).toBe('teams')
    // A team opens no profile; each member opens their own (seat 0 is the only account here)
    expect(detailSides(teams).map(s => [s.name, s.userId, s.members, s.placement])).toEqual([
      [
        'Team A',
        null,
        [
          { name: 'A', userId: 'me' },
          { name: 'C', userId: null },
        ],
        1,
      ],
      [
        'Team B',
        null,
        [
          { name: 'B', userId: null },
          { name: 'D', userId: null },
        ],
        2,
      ],
    ])
  })

  it('makes the X01 headline from legs', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(headline(d, detailSides(d))).toEqual({ big: '3–1', caption: 'Legs · first to 3' })
  })

  it('makes the cricket headline from legs, like X01', () => {
    const d = cricketDetail([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(headline(d, detailSides(d))).toEqual({ big: '3–1', caption: 'Legs · first to 3' })
  })

  it('writes the meta line', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(metaLine(d)).toMatch(/^501 · Double out · First to 3 legs · 26 Sep 2026, \d\d:\d\d · Living room$/)
  })

  it('marks who gave up', () => {
    const d = x01([seat(0, 'A', 2), { ...seat(1, 'B', 1), forfeited: false }])
    d.game.players[0].forfeited = true
    expect(detailSides(d).map(s => s.forfeited)).toEqual([true, false])
  })

  it('highlights you, else the winner', () => {
    const d = x01([seat(0, 'A', 2), seat(1, 'B', 1), seat(2, 'C', 3)])
    expect(highlightDefault(d)).toBe(0)
    expect(highlightDefault({ ...d, game: { ...d.game, mySeat: null } })).toBe(1)
  })

  it('a hilo game gets the generic result (no big number, no custom section)', () => {
    const players = [seat(0, 'Christoph', 1, { livesLeft: 2 }), seat(1, 'Guest 1', 2, { livesLeft: 0, outRound: 4 })]
    const d: GameDetail = {
      game: {
        id: 'g1',
        mode: 'hilo',
        config: { startHigh: 41, startLow: 21, lives: 3 },
        createdAt: '2026-09-26T19:00:00.000Z',
        finishedAt: '2026-09-26T19:14:00.000Z',
        board: { id: 'b', name: 'Living room' },
        mySeat: 0,
        invalidated: false,
        players,
      },
      detail: { mode: 'hilo', start: { high: 41, low: 21 }, visits: [], seats: [] },
      stats: { rows: [], seats: players.map(p => ({ index: p.seat, values: p.stats })) },
    } as unknown as GameDetail
    expect(layoutOf(d)).toBe('duel')
    const sides = detailSides(d)
    expect(sides.map(s => [s.name, s.placement])).toEqual([
      ['Christoph', 1],
      ['Guest 1', 2],
    ])
    expect(headline(d, sides)).toEqual({ big: '', caption: '' })
    expect(metaLine(d)).toMatch(/^41 \/ 21 · 3 lives · 26 Sep 2026, \d\d:\d\d · Living room$/)
  })
})

describe('isGameDetail', () => {
  it('accepts a full payload', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(isGameDetail(d)).toBe(true)
  })

  it('rejects a payload without stats (an older backend)', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    const { stats: _stats, ...rest } = d
    expect(isGameDetail(rest)).toBe(false)
  })

  it('rejects stats missing rows', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    const { rows: _rows, ...statsRest } = d.stats
    expect(isGameDetail({ ...d, stats: statsRest })).toBe(false)
  })

  it('rejects null', () => {
    expect(isGameDetail(null)).toBe(false)
  })
})

describe('cricket leg section', () => {
  const detail = (extra: Record<string, unknown> = {}) => ({
    mode: 'cricket' as const,
    targets: [20, 19, 18, 17, 16, 15, 25],
    legs: [
      {
        leg: 0,
        starter: 0,
        winner: 0,
        marks: [
          [3, 3, 3, 3, 3, 3, 3],
          [3, 3, 3, 2, 0, 1, 0],
        ],
        points: [87, 40],
        visits: [
          { visit: 0, seat: 0, committedAt: '2026-10-26T20:00:00.000Z', darts: [], marks: 3, points: 20 },
          { visit: 1, seat: 1, committedAt: '2026-10-26T20:00:10.000Z', darts: [], marks: 3, points: 0 },
          { visit: 2, seat: 0, committedAt: '2026-10-26T20:00:20.000Z', darts: [], marks: 0, points: 0 },
        ],
      },
    ],
    ...extra,
  })
  const players = [seat(0, 'Lena', 1), seat(1, 'Tom', 2)]

  it("builds a leg's final marks: targets, marks, points and closed copied, leg number and round rigged", () => {
    const d = detail()
    const game = legMarksGame(d, d.legs[0])
    expect(game.targets).toEqual(d.targets)
    expect(game.marks).toEqual(d.legs[0].marks)
    expect(game.points).toEqual([87, 40])
    expect(game.winner).toBe(0)
    // Every side has 3+ marks on 20/19/18 only
    expect(game.closed).toEqual([true, true, true, false, false, false, false])
    expect(legNumber(game)).toBe(1)
    // Seat 0 threw twice (the most of any seat in this leg)
    expect(game.round).toBe(2)
    // Nobody is "up": no seat is -1
    expect(game.currentPlayer).toBe(-1)
  })

  it('names singles sides from the game players, by seat', () => {
    const d = detail()
    const game = legMarksGame(d, d.legs[0])
    const sides = cricketSides(game, playersBySeat(players))
    expect(sides.map(s => [s.seat, s.name, s.members])).toEqual([
      [0, 'Lena', null],
      [1, 'Tom', null],
    ])
  })

  it('names team sides from CricketDetail.teams, with their members', () => {
    const d = detail({
      teams: [
        { id: 'A', name: 'Team A', seats: [0] },
        { id: 'B', name: 'Team B', seats: [1] },
      ],
    })
    const game = legMarksGame(d, d.legs[0])
    const sides = cricketSides(game, playersBySeat(players))
    expect(sides.map(s => [s.name, s.members])).toEqual([
      ['Team A', 'Lena'],
      ['Team B', 'Tom'],
    ])
  })

  it('expands marks to one row per seat: a team on seat 1 shows its own marks, not its neighbour’s', () => {
    const d = detail({
      teams: [
        { id: 'A', name: 'Team A', seats: [1, 3] },
        { id: 'B', name: 'Team B', seats: [0, 2] },
      ],
      legs: [
        {
          leg: 0,
          starter: 1,
          winner: 1,
          marks: [
            [3, 3, 3, 3, 3, 3, 3], // Team A
            [1, 0, 0, 0, 0, 0, 0], // Team B
          ],
          points: [87, 0],
          visits: [],
        },
      ],
    })
    const game = legMarksGame(d, d.legs[0])
    // Seat 1 and 3 (Team A) read Team A's row; seat 0 and 2 (Team B) read Team B's
    expect(game.marks[1]).toEqual([3, 3, 3, 3, 3, 3, 3])
    expect(game.marks[3]).toEqual([3, 3, 3, 3, 3, 3, 3])
    expect(game.marks[0]).toEqual([1, 0, 0, 0, 0, 0, 0])
    expect(game.marks[2]).toEqual([1, 0, 0, 0, 0, 0, 0])
  })

  it("rigs a team game's teams[].legs too, so the second leg's caption still reads Leg 2", () => {
    const d = detail({
      teams: [
        { id: 'A', name: 'Team A', seats: [0] },
        { id: 'B', name: 'Team B', seats: [1] },
      ],
      legs: [
        { leg: 0, starter: 0, winner: 0, marks: [], points: [87, 40], visits: [] },
        { leg: 1, starter: 1, winner: 1, marks: [], points: [57, 64], visits: [] },
      ],
    })
    const game = legMarksGame(d, d.legs[1])
    expect(legNumber(game)).toBe(2)
  })

  it("converts a team leg's winner from a seat to its side index, the live game's convention", () => {
    // leg.winner is seat 0 (Lena); her team sits at side index 1, not 0, so a plain pass-through
    // of the seat number would give the wrong (accidentally-plausible) answer
    const d = detail({
      teams: [
        { id: 'A', name: 'Team A', seats: [1] },
        { id: 'B', name: 'Team B', seats: [0] },
      ],
    })
    const game = legMarksGame(d, d.legs[0])
    expect(game.winner).toBe(1)
  })
})

describe('loadPhase', () => {
  it('treats a malformed id (400) the same as a missing game (404)', () => {
    expect(loadPhase(404)).toBe('missing')
    expect(loadPhase(400)).toBe('missing')
  })

  it('fails on anything else', () => {
    expect(loadPhase(500)).toBe('failed')
    expect(loadPhase(403)).toBe('failed')
  })
})
