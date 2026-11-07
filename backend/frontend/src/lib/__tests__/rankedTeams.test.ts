import { describe, it, expect } from 'vitest'
import { andList, teamClocks, teamRating, throwOrder } from '../ranked/teams.js'
import type { RankedState } from '../ranked/inGame.js'
import type { TeamMember } from '../teams.js'

const T0 = Date.parse('2026-11-04T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const seat = (reserveSeconds = 300): RankedState['seats'][number] => ({
  reserveSeconds,
  inReserve: false,
  disconnectForfeitAt: null,
  stakes: { win: 16, loss: 14 },
  rating: 1200,
  rankIndex: 14,
  placement: null,
  result: null,
})
const ranked = (over: Partial<RankedState> = {}): RankedState => ({
  now: iso(T0),
  mode: '2v2',
  visitSeconds: 120,
  reserveSeconds: 300,
  manualEntry: false,
  visitDeadline: iso(T0 + 100_000),
  forfeitAt: iso(T0 + 400_000),
  seats: [seat(300), seat(260), seat(300), seat(260)],
  ...over,
})
const member = (seat: number, role: TeamMember['role']): TeamMember => ({ seat, name: `s${seat}`, avg: '0.0', role })

describe('teamRating', () => {
  it('averages the players ratings', () => {
    expect(
      teamRating([
        { rank: null, rating: 1241 },
        { rank: null, rating: 1211 },
      ]),
    ).toBe(1226)
  })
  it('is null while one player has no rating', () => {
    expect(
      teamRating([
        { rank: null, rating: 1241 },
        { rank: null, rating: null },
      ]),
    ).toBeNull()
    expect(teamRating([{ rank: null, rating: 1241 }, null])).toBeNull()
    expect(teamRating([])).toBeNull()
  })
})

describe('andList', () => {
  it('joins names', () => {
    expect(andList(['Marco'])).toBe('Marco')
    expect(andList(['Marco', 'Jule'])).toBe('Marco & Jule')
    expect(andList(['A', 'B', 'C'])).toBe('A, B & C')
  })
})

describe('throwOrder', () => {
  // Seats 0 and 2 against 1 and 3: the turn order is 0, 1, 2, 3
  const duo = (up: number) => {
    const order = [0, 1, 2, 3]
    const next = order[(order.indexOf(up) + 1) % 4]
    const role = (s: number): TeamMember['role'] => (s === up ? 'throwing' : s === next ? 'up-next' : 'after')
    return [{ members: [member(0, role(0)), member(2, role(2))] }, { members: [member(1, role(1)), member(3, role(3))] }]
  }
  it('starts with the thrower and alternates the teams', () => {
    expect(throwOrder(duo(1))).toEqual([1, 2, 3, 0])
    expect(throwOrder(duo(0))).toEqual([0, 1, 2, 3])
    expect(throwOrder(duo(3))).toEqual([3, 0, 1, 2])
  })
  it('repeats the players of a smaller team', () => {
    const teams = [{ members: [member(0, 'throwing')] }, { members: [member(1, 'up-next'), member(2, 'after')] }]
    expect(throwOrder(teams)).toEqual([0, 1, 0, 2])
  })
  it('is null once the game is won, or in a game without teams', () => {
    expect(throwOrder([{ members: [member(0, null)] }, { members: [member(1, null)] }])).toBeNull()
    expect(throwOrder([])).toBeNull()
  })
})

describe('teamClocks', () => {
  it('shows the full visit and the team reserve for a team that is not up', () => {
    expect(teamClocks(ranked(), 1, false, 0, T0)).toEqual({ turn: '2:00', reserve: '4:20', running: false, low: false })
  })
  it('counts the visit down for the team that is up', () => {
    expect(teamClocks(ranked(), 0, true, 0, T0 + 1_000)).toEqual({ turn: '1:39', reserve: '5:00', running: true, low: false })
  })
  it('counts the reserve once the visit ran over, red in the last minute', () => {
    const r = ranked({ visitDeadline: iso(T0 - 5_000), forfeitAt: iso(T0 + 55_000) })
    expect(teamClocks(r, 0, true, 0, T0)).toEqual({ turn: '0:00', reserve: '0:55', running: true, low: true })
  })
  it('allows for a screen whose own clock is off', () => {
    expect(teamClocks(ranked(), 0, true, 10_000, T0).turn).toBe('1:30')
  })
  it('shows the visit as paused while no visit clock runs', () => {
    expect(teamClocks(ranked({ visitDeadline: null, forfeitAt: null }), 0, true, 0, T0)).toMatchObject({ turn: '2:00', running: false })
  })
})
