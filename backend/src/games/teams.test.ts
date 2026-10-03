import { describe, it, expect } from 'vitest'
import { teamOfSeats, teamCount, seatsByTeam, turnOrder, seatPlacements, forfeitedTeamSeats } from './teams.js'

describe('teamOfSeats', () => {
  it('gives each seat its own team in singles', () => {
    expect(teamOfSeats({}, 3)).toEqual([0, 1, 2])
    expect(teamOfSeats({}, 0)).toEqual([])
    expect(teamOfSeats({ format: 'singles', teams: [0, 0, 1] }, 3)).toEqual([0, 1, 2])
  })
  it('uses cfg.teams for a team game', () => {
    expect(teamOfSeats({ format: 'teams', teams: [0, 1, 0, 1] }, 4)).toEqual([0, 1, 0, 1])
    expect(teamCount([0, 1, 0, 1])).toBe(2)
    expect(seatsByTeam([0, 1, 0, 1])).toEqual([[0, 2], [1, 3]])
  })
  it('falls back to singles if teams list is missing or has wrong length', () => {
    expect(teamOfSeats({ format: 'teams', teams: [0, 1] }, 3)).toEqual([0, 1, 2])
  })
  it('falls back to singles if team indices have gaps', () => {
    expect(teamOfSeats({ format: 'teams', teams: [1, 1, 1, 1] }, 4)).toEqual([0, 1, 2, 3])
    expect(teamOfSeats({ format: 'teams', teams: [0, 2, 0, 2] }, 4)).toEqual([0, 1, 2, 3])
  })
})

describe('teamOfSeats rejects malformed team indices', () => {
  it('falls back to singles for negative or fractional indices', () => {
    expect(teamOfSeats({ format: 'teams', teams: [0, -1, 0, 1] }, 4)).toEqual([0, 1, 2, 3])
    expect(teamOfSeats({ format: 'teams', teams: [0, 1.5, 0, 1] }, 4)).toEqual([0, 1, 2, 3])
  })
})

describe('turnOrder', () => {
  it('is seat order in singles, rotated to the starter', () => {
    expect(turnOrder([0, 1, 2], 0)).toEqual([0, 1, 2])
    expect(turnOrder([0, 1, 2], 1)).toEqual([1, 2, 0])
  })
  it('alternates teams, 2v2', () => {
    expect(turnOrder([0, 1, 0, 1], 0)).toEqual([0, 1, 2, 3])
    expect(turnOrder([0, 1, 0, 1], 1)).toEqual([1, 0, 3, 2])
  })
  it('repeats the smaller team, 2v1', () => {
    // seats: 0 = A1, 1 = B1, 2 = A2
    expect(turnOrder([0, 1, 0], 0)).toEqual([0, 1, 2, 1])
    expect(turnOrder([0, 1, 0], 1)).toEqual([1, 0, 1, 2])
  })
  it('handles empty teams', () => {
    expect(turnOrder([], 0)).toEqual([])
  })
  it('handles single-seat teams', () => {
    expect(turnOrder([0], 0)).toEqual([0])
  })
  it('repeats smallest team across multiple rounds', () => {
    expect(turnOrder([0, 1, 0, 0], 0)).toEqual([0, 1, 2, 1, 3, 1])
    expect(turnOrder([0, 1, 0, 1, 0], 0)).toEqual([0, 1, 2, 3, 4, 1])
  })
})

describe('placements', () => {
  it('gives every seat its team placement', () => {
    expect(seatPlacements([0, 1, 0, 1], [2, 1])).toEqual([2, 1, 2, 1])
  })
  it('extends a forfeit to the whole team', () => {
    expect([...forfeitedTeamSeats([0, 1, 0, 1], new Set([2]))].sort()).toEqual([0, 2])
    expect([...forfeitedTeamSeats([0, 1, 2], new Set([1]))]).toEqual([1])
  })
})
