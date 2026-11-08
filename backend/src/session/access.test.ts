import { describe, it, expect, vi } from 'vitest'
import { authorizeAction, canAccessSession, canSpectateSession, canWatchSession, isHost } from './access.js'
import { applyInput } from './apply.js'
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

describe('authorizeAction in a ranked game', () => {
  const seats = [seat('Ann', 'ann', 'a'), seat('Bob', 'bob', 'b')]
  const newGame = () => ({
    ...newSession({
      id: 's1',
      ownerUserId: 'ann',
      boardId: null,
      module: x01Module,
      config: { ...x01Module.defaultConfig, bullOff: 'pdc' },
      seats,
      seed: 1,
      createdAt: new Date(),
    }),
    ranked: { mode: '1v1' as const, sides: [['ann'], ['bob']] as [string[], string[]], entries: {}, rules: null },
  })
  const bull = { name: '50', number: 50, bed: 'Double', multiplier: 1 } as const
  const miss = { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 } as const
  // Each seat throws its one bull off dart (by hand) and takes it out
  const bullOff = (darts: [typeof bull | typeof miss, typeof bull | typeof miss]) => {
    const s = newGame()
    const at = new Date()
    for (const segment of darts) {
      applyInput(s, { source: 'user', action: { type: 'add_dart', segment } }, at)
      applyInput(s, { source: 'user', action: { type: 'takeout' } }, at)
    }
    return s
  }

  it('has no host: the owner is a player like the other', () => {
    const s = newGame()
    expect(isHost('ann', s)).toBe(false)
  })

  it('lets either seat start the bull off, and nobody else', () => {
    const s = newGame()
    expect(authorizeAction(s, 'ann', { type: 'bulloff_start' })).toEqual({ type: 'bulloff_start' })
    expect(authorizeAction(s, 'bob', { type: 'bulloff_start' })).toEqual({ type: 'bulloff_start' })
    expect(authorizeAction(s, 'carl', { type: 'bulloff_start' })).toBeNull()
  })

  it('lets a seat repeat the bull off when nobody hit the bull, but not after a clear result', () => {
    const tie = bullOff([miss, miss])
    expect(authorizeAction(tie, 'bob', { type: 'bulloff_rethrow' })).toEqual({ type: 'bulloff_rethrow' })
    expect(authorizeAction(tie, 'carl', { type: 'bulloff_rethrow' })).toBeNull()
    const clear = bullOff([bull, miss])
    expect(authorizeAction(clear, 'bob', { type: 'bulloff_rethrow' })).toBeNull()
    expect(authorizeAction(clear, 'ann', { type: 'bulloff_rethrow' })).toBeNull()
  })
})

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

describe('canSpectateSession', () => {
  // Viewers' friends who are visible (an Invisible friend is left out, as FriendsService.watchable does)
  const friendsOf: Record<string, string[]> = { max: ['lena'], ina: ['host'], pia: [], lena: ['host'] }
  const watchable = (viewer: string, ids: string[]) => Promise.resolve((friendsOf[viewer] ?? []).some(f => ids.includes(f)))
  const running = () => game([seat('Host', 'host', 'a'), seat('Lena', 'lena', 'b')])

  it('lets a friend of any seat watch', async () => {
    expect(await canSpectateSession('max', running(), watchable)).toBe(true)
    expect(await canSpectateSession('ina', running(), watchable)).toBe(true)
  })

  it('refuses a stranger and a viewer whose friends are Invisible', async () => {
    expect(await canSpectateSession('pia', running(), watchable)).toBe(false)
    expect(await canSpectateSession('nobody', running(), watchable)).toBe(false)
  })

  it('refuses a player of the game: they use the game socket', async () => {
    expect(await canSpectateSession('lena', running(), watchable)).toBe(false)
    expect(await canSpectateSession('host', running(), watchable)).toBe(false)
  })

  it('refuses a game that has ended', async () => {
    const s = running()
    s.status = 'finished'
    expect(await canSpectateSession('max', s, watchable)).toBe(false)
    s.status = 'aborted'
    expect(await canSpectateSession('max', s, watchable)).toBe(false)
  })

  it('asks about the controller of a guest seat too', async () => {
    const ask = vi.fn(watchable)
    const remote = game([
      { ...seat('Guest', 'lena', 'a'), userId: null },
      { ...seat('Bot', 'host', null), userId: null },
    ])
    expect(await canSpectateSession('max', remote, ask)).toBe(true)
    expect(ask).toHaveBeenCalledWith('max', expect.arrayContaining(['lena', 'host']))
  })
})
