import { describe, it, expect, vi } from 'vitest'
import { authorizeAction, canAccessSession, canWatchSession, isHost } from './access.js'
import { newSession } from './replay.js'
import { x01Module } from '../games/x01.js'
import type { Seat } from './types.js'

const seat = (name: string, controllerUserId: string, boardId: string | null): Seat => ({
  name,
  userId: controllerUserId,
  controllerUserId,
  boardId,
  boardName: null,
  bot: null,
})

function game(seats: Seat[], owner = 'host') {
  return newSession({
    id: 's1',
    ownerUserId: owner,
    boardId: null,
    module: x01Module,
    config: x01Module.defaultConfig,
    seats,
    seed: 1,
    createdAt: new Date(),
  })
}

const seg = { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 } as const

describe('authorizeAction', () => {
  const s = game([seat('Host', 'host', 'a'), seat('Lena', 'lena', 'b'), seat('Guest', 'host', 'a')])

  it('lets only the controller of the seat that is up throw, undo, correct or take out', () => {
    for (const action of [
      { type: 'add_dart', segment: seg },
      { type: 'undo_dart' },
      { type: 'takeout' },
      { type: 'correct_dart', visitIndex: 0, segment: seg },
      { type: 'bulloff_skip' },
    ] as const) {
      expect(authorizeAction(s, 'host', action)).toEqual(action)
      expect(authorizeAction(s, 'lena', action)).toBeNull()
    }
  })

  it('leaves bull off start/rethrow and unknown game actions to the host', () => {
    expect(authorizeAction(s, 'host', { type: 'bulloff_start' })).toEqual({ type: 'bulloff_start' })
    expect(authorizeAction(s, 'lena', { type: 'bulloff_start' })).toBeNull()
    expect(authorizeAction(s, 'lena', { type: 'bulloff_rethrow' })).toBeNull()
  })

  it('fills a forfeit in with every seat the sender controls', () => {
    expect(authorizeAction(s, 'host', { type: 'forfeit' })).toEqual({ type: 'forfeit', seats: [0, 2] })
    expect(authorizeAction(s, 'lena', { type: 'forfeit', seats: [0] })).toEqual({ type: 'forfeit', seats: [1] })
  })

  it('refuses a forfeit with nobody left to lose to, or from someone without seats', () => {
    expect(authorizeAction(game([seat('A', 'host', 'a'), seat('B', 'host', 'a')]), 'host', { type: 'forfeit' })).toBeNull()
    expect(authorizeAction(s, 'stranger', { type: 'forfeit' })).toBeNull()
  })

  it('a forfeit in teams covers whole teams: refused across both, allowed within one', () => {
    const teamCfg = { ...x01Module.defaultConfig, format: 'teams' as const, teams: [0, 1, 0, 1] }
    // controls seat 0 (Team A) and seat 3 (Team B): nobody left to lose to
    const bothTeams = newSession({
      id: 'both',
      ownerUserId: 'host',
      boardId: null,
      module: x01Module,
      config: teamCfg,
      seed: 1,
      createdAt: new Date(),
      seats: [seat('A1', 'both', 'a'), seat('B1', 'lena', 'b'), seat('A2', 'max', 'c'), seat('B2', 'both', 'd')],
    })
    expect(authorizeAction(bothTeams, 'both', { type: 'forfeit' })).toBeNull()

    // controls seats 0 and 2, both Team A: Team B is still left to lose to
    const oneTeam = newSession({
      id: 'one',
      ownerUserId: 'host',
      boardId: null,
      module: x01Module,
      config: teamCfg,
      seed: 1,
      createdAt: new Date(),
      seats: [seat('A1', 'teamA', 'a'), seat('B1', 'lena', 'b'), seat('A2', 'teamA', 'c'), seat('B2', 'max', 'd')],
    })
    expect(authorizeAction(oneTeam, 'teamA', { type: 'forfeit' })).toEqual({ type: 'forfeit', seats: [0, 2] })
  })
})

describe('canAccessSession / isHost', () => {
  const s = game([seat('Host', 'host', 'a'), seat('Lena', 'lena', 'b')])
  it('lets the host and every controller in, nobody else', () => {
    expect(canAccessSession('host', s)).toBe(true)
    expect(canAccessSession('lena', s)).toBe(true)
    expect(canAccessSession('max', s)).toBe(false)
  })
  it('knows the host', () => {
    expect(isHost('host', s)).toBe(true)
    expect(isHost('lena', s)).toBe(false)
  })
})

describe('canWatchSession', () => {
  const lobbyGame = () =>
    newSession({
      id: 's1',
      ownerUserId: 'host',
      boardId: null,
      module: x01Module,
      config: x01Module.defaultConfig,
      seed: 1,
      createdAt: new Date(),
      lobbyId: 'l1',
      seats: [{ name: 'Host', userId: 'host', controllerUserId: 'host', boardId: null, boardName: null, bot: null }],
    })

  it("lets the lobby's members watch its game, besides the host and controllers", async () => {
    const isMember = vi.fn((lobbyId: string, userId: string) => Promise.resolve(lobbyId === 'l1' && userId === 'lena'))
    expect(await canWatchSession('lena', lobbyGame(), isMember)).toBe(true)
    expect(await canWatchSession('max', lobbyGame(), isMember)).toBe(false)
    expect(await canWatchSession('host', lobbyGame(), isMember)).toBe(true)
  })

  it('never asks about lobbies for a local game', async () => {
    const isMember = vi.fn(() => Promise.resolve(true))
    const local = newSession({
      id: 's2',
      ownerUserId: 'host',
      boardId: null,
      module: x01Module,
      config: x01Module.defaultConfig,
      seed: 1,
      createdAt: new Date(),
      seats: [{ name: 'Host', userId: 'host', controllerUserId: 'host', boardId: null, boardName: null, bot: null }],
    })
    expect(await canWatchSession('lena', local, isMember)).toBe(false)
    expect(isMember).not.toHaveBeenCalled()
  })
})
