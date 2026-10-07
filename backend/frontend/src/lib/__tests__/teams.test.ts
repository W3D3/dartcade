import { describe, it, expect } from 'vitest'
import { teamsLabel, teamOf, winnerName, x01Teams } from '../teams.js'
import type { X01Game } from '../api/game-ws'

const lv = (seat: number, scored: number, left: number) => ({ seat, scored, left, darts: 3, bust: false })
// This leg: C 100, L 140, G 85, M 41, C 45, L 100, G 130, M 133 (60 running for C, 81 left);
// Christoph also threw 60 at the end of the previous leg
const legVisits = [
  lv(0, 100, 401),
  lv(1, 140, 361),
  lv(2, 85, 316),
  lv(3, 41, 320),
  lv(0, 45, 271),
  lv(1, 100, 220),
  lv(2, 130, 141),
  lv(3, 133, 87),
]
const team = (id: 'A' | 'B', seats: number[], o: { score?: number; legs?: number } = {}) => ({
  id,
  name: `Team ${id}`,
  seats,
  score: o.score ?? 501,
  legs: o.legs ?? 0,
})
const players = [{ name: 'Christoph' }, { name: 'Lena' }, { name: 'Guest 1' }, { name: 'Max' }]

// The design's 2v2: Team A (Christoph, Guest 1) on 81 with Christoph throwing (T20 so far), Team B (Lena, Max) on 87
const game = (o: Record<string, unknown> = {}): X01Game =>
  ({
    scores: [81, 87, 81, 87],
    opened: [true, true, true, true],
    legs: [1, 1, 1, 1],
    firstTo: 2,
    winner: null,
    currentPlayer: 0,
    nextPlayer: 1,
    totalDarts: [7, 6, 6, 6],
    bustThisVisit: false,
    config: { outMode: 'double', inMode: 'straight', startScore: 501 },
    currentVisitDarts: [{ segment: { name: 'T20' }, score: 60 }],
    teams: [team('A', [0, 2], { score: 81, legs: 1 }), team('B', [1, 3], { score: 87, legs: 1 })],
    pointsScored: [205, 240, 215, 174],
    dartsThrown: [9, 6, 6, 6],
    legVisits,
    lastVisit: [lv(0, 45, 271), lv(1, 100, 220), lv(2, 130, 141), lv(3, 133, 87)],
    checkoutAttempts: [0, 0, 0, 0],
    checkoutHits: [0, 0, 0, 0],
    visitStartScores: [141, 87, 141, 87],
    ...o,
  }) as unknown as X01Game
const none = { pointsScored: [0, 0, 0, 0], dartsThrown: [0, 0, 0, 0], legVisits: [], lastVisit: [null, null, null, null] }
const opts = { suggest: true }

describe('teamsLabel', () => {
  it('names the team sizes', () => {
    expect(teamsLabel([team('A', [0, 2]), team('B', [1, 3])])).toBe('Teams 2v2')
    expect(teamsLabel([team('A', [0, 2]), team('B', [1])])).toBe('Teams 2v1')
  })
})

describe('teamOf / winnerName', () => {
  it('finds the team of a seat', () => {
    expect(teamOf(game(), 3)?.id).toBe('B')
    expect(teamOf(game({ teams: undefined }), 3)).toBeNull()
  })
  it('a team game names the winning team; singles the player', () => {
    expect(winnerName(game({ winner: 2 }), players)).toBe('Team A')
    expect(winnerName(game({ winner: 1, teams: undefined }), players)).toBe('Lena')
    expect(winnerName(game(), players)).toBeNull()
  })
})

describe('x01Teams', () => {
  it('the throwing team: shared score, running visit, team and match averages, darts', () => {
    const [a] = x01Teams(game(), players, opts)
    expect(a).toMatchObject({
      id: 'A',
      name: 'Team A',
      active: true,
      won: false,
      remaining: 81,
      opened: true,
      legsWon: 1,
      firstTo: 2,
      // 360 in 12 darts this leg; 420 in 15 over the match
      teamAvg: '90.0',
      matchAvg: '84.0',
      darts: 13,
      current: { scored: 60, left: 81, bust: false },
      currentMark: 'C',
    })
    expect(a.canFinish).toBe('T19 · D12')
  })

  it("'visit': the thrower's team holds the score its visit started from; the other team shows its own", () => {
    const [a, b] = x01Teams(game(), players, { ...opts, scoreUpdates: 'visit' })
    expect([a.remaining, a.shown, b.shown]).toEqual([81, 141, 87])
    expect(x01Teams(game(), players, opts)[0].shown).toBe(81)
  })

  it('counts the legs both teams have played', () => {
    const [a, b] = x01Teams(game(), players, opts)
    expect([a.leg, b.leg]).toEqual([2, 2])
  })

  it("the visit list interleaves the team's players in throwing order, each marked by initial", () => {
    const [a, b] = x01Teams(game(), players, opts)
    expect(a.visits.map(x => x.scored)).toEqual([100, 85, 45, 130])
    expect(a.marks).toEqual(['C', 'G', 'C', 'G'])
    expect(b.visits.map(x => x.left)).toEqual([361, 320, 220, 87])
    expect(b.marks).toEqual(['L', 'M', 'L', 'M'])
    expect(b.current).toBeNull()
    expect(b.currentMark).toBeNull()
  })

  it('members: Throwing, Up next for the next thrower, "after" for the rest', () => {
    const [a, b] = x01Teams(game(), players, opts)
    expect(a.members.map(m => [m.seat, m.name, m.role, m.avg])).toEqual([
      [0, 'Christoph', 'throwing', '68.3'],
      [2, 'Guest 1', 'after', '107.5'],
    ])
    expect(b.members.map(m => [m.seat, m.role])).toEqual([
      [1, 'up-next'],
      [3, 'after'],
    ])
  })

  it("Up next is the server's nextPlayer: at a checkout, the next leg's starter", () => {
    const [a, b] = x01Teams(game({ nextPlayer: 3 }), players, opts)
    expect(a.members.map(m => m.role)).toEqual(['throwing', 'after'])
    expect(b.members.map(m => [m.seat, m.role])).toEqual([
      [1, 'after'],
      [3, 'up-next'],
    ])
  })

  it('nobody is up next when the visit ends the game', () => {
    const [, b] = x01Teams(game({ nextPlayer: null }), players, opts)
    expect(b.members.map(m => m.role)).toEqual(['after', 'after'])
  })

  it('the waiting team can finish with three darts', () => {
    const [, b] = x01Teams(game(), players, opts)
    expect(b.active).toBe(false)
    expect(b.canFinish).toBe('T17 · D18')
  })

  it('before any visit the averages are dashes and the visit list is empty', () => {
    const [a] = x01Teams(game(none), players, opts)
    expect([a.teamAvg, a.matchAvg, a.visits, a.marks]).toEqual(['—', '—', [], []])
  })

  it("the team's checkout rate sums its players' darts at a finish", () => {
    const [a] = x01Teams(game({ checkoutAttempts: [2, 0, 3, 0], checkoutHits: [1, 0, 1, 0] }), players, opts)
    expect(a).toMatchObject({ checkout: '40%', checkoutDarts: '2/5' })
  })

  it('a finished game: the winning team is marked, nobody is throwing', () => {
    const [a, b] = x01Teams(game({ winner: 2, currentVisitDarts: [] }), players, opts)
    expect([a.won, b.won, a.active]).toEqual([true, false, false])
    expect(a.members.every(m => m.role === null)).toBe(true)
  })

  it('a singles game has no teams', () => {
    expect(x01Teams(game({ teams: undefined }), players, opts)).toEqual([])
  })
})
