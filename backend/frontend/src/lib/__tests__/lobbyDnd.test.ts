import { describe, it, expect } from 'vitest'
import { listKeyMove, listPlacement, placed, reorder, samePlace, teamKeyMove, teamPlacement } from '../lobby/dnd.js'
import type { LobbyPerson, TeamId } from '../api/lobby-ws'

const person = (id: string, team: TeamId | null, plays = true): LobbyPerson => ({
  id,
  userId: null,
  addedByUserId: 'chris',
  name: id.toUpperCase(),
  boardId: null,
  boardName: null,
  boardOwnerUserId: null,
  boardOnline: false,
  boardMovedBy: null,
  usualBoardName: null,
  plays,
  ready: false,
  team,
  presence: null,
})
// Lobby order: a1 b1 x(sits out, team A) a2 b2 a3
const a1 = person('a1', 'A'),
  b1 = person('b1', 'B'),
  x = person('x', 'A', false),
  a2 = person('a2', 'A'),
  b2 = person('b2', 'B'),
  a3 = person('a3', 'A')
const people = [a1, b1, x, a2, b2, a3]
const ids = (ps: LobbyPerson[]) => ps.map(p => p.id)
const teamOf = (ps: LobbyPerson[], id: string) => ps.find(p => p.id === id)?.team

describe('reorder (mirrors the server)', () => {
  it('takes the person out and puts them back at the index', () => {
    expect(reorder(ids(people), 'a1', 2)).toEqual(['b1', 'x', 'a1', 'a2', 'b2', 'a3'])
    expect(reorder(ids(people), 'a3', 0)).toEqual(['a3', 'a1', 'b1', 'x', 'a2', 'b2'])
    expect(reorder(ids(people), 'a1', 99)).toEqual(['b1', 'x', 'a2', 'b2', 'a3', 'a1'])
  })
})

describe('listPlacement', () => {
  it('drops before someone: that spot, whether they were above or below', () => {
    expect(reorder(ids(people), 'a3', listPlacement(people, 'a3', 'b1').position)).toEqual(['a1', 'a3', 'b1', 'x', 'a2', 'b2'])
    expect(reorder(ids(people), 'a1', listPlacement(people, 'a1', 'b2').position)).toEqual(['b1', 'x', 'a2', 'a1', 'b2', 'a3'])
  })
  it('drops at the top and at the bottom', () => {
    expect(listPlacement(people, 'b2', 'a1')).toEqual({ position: 0 })
    expect(reorder(ids(people), 'a1', listPlacement(people, 'a1', null).position)).toEqual(['b1', 'x', 'a2', 'b2', 'a3', 'a1'])
  })
})

describe('teamPlacement', () => {
  const after = (id: string, team: TeamId, before: string | null) => {
    const p = teamPlacement(people, id, team, before)
    return { order: reorder(ids(people), id, p.position), team: p.team }
  }

  it('within a team: before a teammate', () => {
    expect(after('a3', 'A', 'a2')).toEqual({ order: ['a1', 'b1', 'x', 'a3', 'a2', 'b2'], team: 'A' })
    expect(after('a3', 'A', 'a1')).toEqual({ order: ['a3', 'a1', 'b1', 'x', 'a2', 'b2'], team: 'A' })
    expect(after('a1', 'A', 'a3')).toEqual({ order: ['b1', 'x', 'a2', 'b2', 'a1', 'a3'], team: 'A' })
  })
  it('within a team: after the last teammate', () => {
    expect(after('a1', 'A', null)).toEqual({ order: ['b1', 'x', 'a2', 'b2', 'a3', 'a1'], team: 'A' })
    // Already last: stays put
    expect(after('a3', 'A', null)).toEqual({ order: ids(people), team: 'A' })
  })
  it('within a team: a drop that keeps the team order keeps the lobby order', () => {
    // a1 is already just before a2 on Team A (b1 and x sit between them in the lobby)
    expect(after('a1', 'A', 'a2')).toEqual({ order: ids(people), team: 'A' })
  })
  it('across teams: at the drop spot among the new teammates', () => {
    expect(after('a2', 'B', 'b1')).toEqual({ order: ['a1', 'a2', 'b1', 'x', 'b2', 'a3'], team: 'B' })
    expect(after('a2', 'B', 'b2')).toEqual({ order: ['a1', 'b1', 'x', 'a2', 'b2', 'a3'], team: 'B' })
    expect(after('a1', 'B', null)).toEqual({ order: ['b1', 'x', 'a2', 'b2', 'a1', 'a3'], team: 'B' })
    expect(after('b2', 'A', 'a1')).toEqual({ order: ['b2', 'a1', 'b1', 'x', 'a2', 'a3'], team: 'A' })
    expect(after('b1', 'A', null)).toEqual({ order: ['a1', 'x', 'a2', 'b2', 'a3', 'b1'], team: 'A' })
  })
  it('people sitting out are skipped as teammates but keep their place', () => {
    // x is on Team A but sits out: dropping b2 after a1 (before a2) lands after x, not before it
    expect(after('b2', 'A', 'a2')).toEqual({ order: ['a1', 'b1', 'x', 'b2', 'a2', 'a3'], team: 'A' })
  })
  it('into an empty team: keeps their place in the lobby', () => {
    const solo = [a1, a2, x]
    expect(teamPlacement(solo, 'a2', 'B', null)).toEqual({ team: 'B', position: 1 })
  })
})

describe('placed (the optimistic order)', () => {
  it('reorders and sets the team', () => {
    const next = placed(people, 'a2', { team: 'B', position: 1 })
    expect(ids(next)).toEqual(['a1', 'a2', 'b1', 'x', 'b2', 'a3'])
    expect(teamOf(next, 'a2')).toBe('B')
    expect(teamOf(people, 'a2')).toBe('A')
  })
  it('knows a drop that changes nothing', () => {
    expect(samePlace(people, 'a3', teamPlacement(people, 'a3', 'A', null))).toBe(true)
    expect(samePlace(people, 'a1', listPlacement(people, 'a1', 'b1'))).toBe(true)
    expect(samePlace(people, 'a1', listPlacement(people, 'a1', 'x'))).toBe(false)
    expect(samePlace(people, 'a3', { team: 'B', position: 5 })).toBe(false)
  })
})

describe('keyboard moves', () => {
  it('the list: one place up or down, none past the ends', () => {
    expect(listKeyMove(people, 'b1', 'up')).toEqual({ position: 0 })
    expect(listKeyMove(people, 'b1', 'down')).toEqual({ position: 2 })
    expect(listKeyMove(people, 'a1', 'up')).toBeNull()
    expect(listKeyMove(people, 'a3', 'down')).toBeNull()
    expect(listKeyMove(people, 'a1', 'left')).toBeNull()
  })
  it('the teams: past one teammate up or down', () => {
    const move = (id: string, dir: 'up' | 'down' | 'left' | 'right') => {
      const p = teamKeyMove(people, id, dir)
      return p && { order: reorder(ids(people), id, p.position), team: p.team }
    }
    expect(move('a2', 'up')).toEqual({ order: ['a2', 'a1', 'b1', 'x', 'b2', 'a3'], team: 'A' })
    expect(move('a2', 'down')).toEqual({ order: ['a1', 'b1', 'x', 'b2', 'a3', 'a2'], team: 'A' })
    expect(move('a1', 'up')).toBeNull()
    expect(move('a3', 'down')).toBeNull()
    expect(move('b1', 'down')).toEqual({ order: ['a1', 'x', 'a2', 'b2', 'b1', 'a3'], team: 'B' })
  })
  it('the teams: left to Team A, right to Team B, at the same rank', () => {
    const move = (id: string, dir: 'left' | 'right') => {
      const p = teamKeyMove(people, id, dir)
      return p && { order: reorder(ids(people), id, p.position), team: p.team }
    }
    // a2 is second on Team A: second on Team B, before b2
    expect(move('a2', 'right')).toEqual({ order: ['a1', 'b1', 'x', 'a2', 'b2', 'a3'], team: 'B' })
    // b1 is first on Team B: first on Team A
    expect(move('b1', 'left')).toEqual({ order: ['b1', 'a1', 'x', 'a2', 'b2', 'a3'], team: 'A' })
    expect(move('a1', 'left')).toBeNull()
    expect(move('b1', 'right')).toBeNull()
  })
})
