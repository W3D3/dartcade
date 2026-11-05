import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from './engine.js'
import { x01Module } from '../games/x01.js'
import { isHost } from './access.js'
import type { RankedGame, Seat } from './types.js'

const seat = (name: string, user: string): Seat => ({
  name,
  userId: user,
  controllerUserId: user,
  boardId: null,
  boardName: null,
  bot: null,
})
const ranked: RankedGame = { mode: '1v1', sides: [['ann'], ['bob']], ratings: { ann: 1200, bob: 1200 }, rules: null }

function makeStore() {
  return {
    insertSession: vi.fn().mockResolvedValue(undefined),
    getActiveSessions: vi.fn().mockResolvedValue([]),
    getSessionEvents: vi.fn().mockResolvedValue([]),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    insertDarts: vi.fn().mockResolvedValue(undefined),
    deleteDarts: vi.fn().mockResolvedValue(undefined),
    finishSession: vi.fn().mockResolvedValue(undefined),
    abortSession: vi.fn().mockResolvedValue(undefined),
    getAvatars: vi.fn().mockResolvedValue(new Map()),
  } satisfies EngineStore
}

const config = { ...x01Module.defaultConfig, bullOff: 'off' as const }

describe('a ranked session', () => {
  it('is stored together with the session and has no host', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, vi.fn())
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'ann',
      gameId: 'x01',
      config,
      seats: [seat('Ann', 'ann'), seat('Bob', 'bob')],
      ranked,
    })
    expect(store.insertSession).toHaveBeenCalledWith(expect.objectContaining({ id: sessionId, ranked }))
    const session = engine.getSession(sessionId)
    expect(session?.ranked).toEqual(ranked)
    expect(session && isHost('ann', session)).toBe(false)
    expect(engine.getSnapshot(sessionId)).toMatchObject({ rankedGame: true })
  })

  it('is ranked again when the game is rebuilt', async () => {
    const store = makeStore()
    store.getActiveSessions.mockResolvedValue([
      {
        id: 's1',
        owner_user_id: 'ann',
        board_db_id: null,
        game_id: 'x01',
        game_version: x01Module.version,
        rng_seed: 1,
        config,
        created_at: new Date(),
        lobby_id: null,
        lobby_name: null,
        ranked,
        players: [
          { name: 'Ann', user_id: 'ann', controller_user_id: 'ann', board_db_id: null, board_name: null, bot_level: null },
          { name: 'Bob', user_id: 'bob', controller_user_id: 'bob', board_db_id: null, board_name: null, bot_level: null },
        ],
      },
    ])
    const engine = new SessionEngine(store, vi.fn())
    await engine.rebuild()
    expect(engine.getSession('s1')?.ranked).toEqual(ranked)
  })

  it('is recorded before the final snapshot goes out, unlike any other game', async () => {
    const order: string[] = []
    const run = async (rankedGame: RankedGame | undefined) => {
      order.length = 0
      const engine = new SessionEngine(
        makeStore(),
        id => {
          if (engine.getSession(id)?.status === 'finished') order.push('push')
        },
        undefined,
        undefined,
        () => {
          order.push('ended')
        },
      )
      const { sessionId } = await engine.createWithSeats({
        ownerUserId: 'ann',
        gameId: 'x01',
        config,
        seats: [seat('Ann', 'ann'), seat('Bob', 'bob')],
        ranked: rankedGame,
      })
      await engine.onUserAction(sessionId, 'bob', { type: 'forfeit' })
      return [...order]
    }
    expect(await run(ranked)).toEqual(['ended', 'push'])
    expect(await run(undefined)).toEqual(['push', 'ended'])
  })
})
