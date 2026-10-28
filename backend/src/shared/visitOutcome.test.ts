import { describe, it, expect } from 'vitest'
import { legsOf, visitEnd, visitOutcome, type CountdownGame } from './visitOutcome.js'

const dart = {}
const game = (o: Partial<CountdownGame> = {}): CountdownGame => ({
  phase: 'game',
  currentPlayer: 0,
  bustThisVisit: false,
  visitLocked: false,
  currentVisitDarts: [],
  totalVisits: [0, 0],
  legs: [0, 0],
  firstTo: 2,
  scores: [501, 501],
  visitStartScores: [501, 501],
  ...o,
})

describe('visitOutcome', () => {
  it('reads a visit once, at its third dart, as what it took off', () => {
    const two = game({ currentVisitDarts: [dart, dart], scores: [441, 501] })
    const three = game({ currentVisitDarts: [dart, dart, dart], scores: [381, 501] })
    expect(visitOutcome(two, three)).toEqual({ kind: 'visit', seat: 0, total: 120 })
    // already over: the takeout says nothing more
    expect(visitOutcome(three, game({ currentPlayer: 1, totalVisits: [1, 0], scores: [381, 501] }))).toBeNull()
  })

  it('reads a visit cut short by the takeout as committed, by the seat that threw it', () => {
    const one = game({ currentVisitDarts: [dart], scores: [441, 501] })
    expect(visitOutcome(one, game({ currentPlayer: 1, totalVisits: [1, 0], scores: [441, 501], visitStartScores: [441, 501] }))).toEqual({
      kind: 'visit',
      seat: 0,
      total: 60,
    })
  })

  it('tells a bust, a leg checkout and a match checkout apart', () => {
    const before = game({ currentVisitDarts: [dart], scores: [40, 501], visitStartScores: [100, 501] })
    expect(visitOutcome(before, game({ bustThisVisit: true, visitLocked: true, currentVisitDarts: [dart, dart] }))).toEqual({
      kind: 'bust',
      seat: 0,
    })
    const out = { visitLocked: true, currentVisitDarts: [dart, dart], scores: [0, 501], visitStartScores: [100, 501] }
    expect(visitOutcome(before, game(out))).toEqual({ kind: 'checkout', seat: 0, match: false, leg: 1 })
    expect(visitOutcome(before, game({ ...out, legs: [1, 0] }))).toEqual({ kind: 'checkout', seat: 0, match: true, leg: 2 })
  })

  it('has no leg to name in a game without legs, and nothing to say outside play', () => {
    expect(visitEnd(game({ visitLocked: true, scores: [0, 121], firstTo: undefined, legs: undefined }))).toEqual({
      kind: 'checkout',
      seat: 0,
      match: false,
      leg: null,
    })
    expect(visitOutcome(null, game())).toBeNull()
    expect(visitOutcome(game({ phase: 'bulloff' }), game())).toBeNull()
  })

  it('counts a team game by the team, and reads a tally game by its visit total', () => {
    const teams = [
      { seats: [0, 2], legs: 1 },
      { seats: [1, 3], legs: 0 },
    ]
    expect(legsOf(game({ teams }), 2)).toBe(1)
    const tally = { ...game(), visitTotal: 45 }
    expect(visitEnd({ ...tally, currentVisitDarts: [dart, dart, dart] })).toEqual({ kind: 'visit', seat: 0, total: 45 })
  })
})
