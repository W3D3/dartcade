import { describe, it, expect, vi } from 'vitest'
import { cleanUpAccount, decideCleanupAction } from './cleanup.js'
import { SessionEngine, type EngineStore } from '../session/engine.js'
import { newSession } from '../session/replay.js'
import { x01Module } from '../games/x01.js'
import type { Seat } from '../session/types.js'

const seat = (name: string, controllerUserId: string): Seat => ({
  name,
  userId: controllerUserId,
  controllerUserId,
  boardId: null,
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

describe('decideCleanupAction', () => {
  it('forfeits when the user holds a live seat and someone else is still left to play', () => {
    const s = game([seat('Host', 'host'), seat('Lena', 'lena')])
    expect(decideCleanupAction(s, 'host')).toBe('forfeit')
  })

  it('aborts when the user holds every live seat (or every live team): nobody would be left', () => {
    const s = game([seat('A', 'host'), seat('B', 'host')])
    expect(decideCleanupAction(s, 'host')).toBe('abort')
  })

  it('does nothing for a non-playing owner: the host running the game for others keeps no live seat', () => {
    const s = game([seat('Lena', 'lena'), seat('Max', 'max')], 'host')
    expect(decideCleanupAction(s, 'host')).toBe('none')
  })

  it('does nothing for a stranger who controls no seat', () => {
    const s = game([seat('Host', 'host'), seat('Lena', 'lena')])
    expect(decideCleanupAction(s, 'stranger')).toBe('none')
  })

  it('forfeits only the seats the user still controls, ignoring already-forfeited ones', () => {
    const s = game([seat('Host', 'host'), seat('Lena', 'lena'), seat('Guest', 'host')])
    s.forfeited.push(2)
    expect(decideCleanupAction(s, 'host')).toBe('forfeit')
  })
})

describe('cleanUpAccount', () => {
  it('ends every tournament game an organizer runs with guest seats they control, not just one', async () => {
    const abortSession = vi.fn().mockResolvedValue(undefined)
    const store: EngineStore = {
      insertSession: vi.fn().mockResolvedValue(undefined),
      getActiveSessions: vi.fn().mockResolvedValue([]),
      getSessionEvents: vi.fn().mockResolvedValue([]),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      insertDarts: vi.fn().mockResolvedValue(undefined),
      deleteDarts: vi.fn().mockResolvedValue(undefined),
      finishSession: vi.fn().mockResolvedValue(undefined),
      abortSession,
      getAvatars: vi.fn().mockResolvedValue(new Map()),
    }
    const engine = new SessionEngine(store, () => undefined)
    const guest = (name: string, boardId: string): Seat => ({ ...seat(name, 'org'), userId: null, boardId })
    const match = (id: string, boardId: string) =>
      engine.createWithSeats({
        ownerUserId: 'org',
        gameId: 'x01',
        config: x01Module.defaultConfig,
        seats: [guest('Anna', boardId), guest('Ben', boardId)],
        tournamentMatchId: id,
      })
    const games = [await match('m1', 'board-1'), await match('m2', 'board-2')]
    const lobbies = { current: vi.fn().mockResolvedValue(null), leave: vi.fn() }

    await cleanUpAccount({ engine, lobbies }, 'org')

    expect(games.map(g => engine.getSession(g.sessionId)?.status ?? 'gone')).toEqual(['gone', 'gone'])
    expect(abortSession).toHaveBeenCalledTimes(2)
    expect(engine.sessionsOf('org')).toEqual([])
  })
})
