import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/lobbies.js'
import { SessionEngine, type EngineStore } from '../session/engine.js'
import { x01Module } from '../games/x01.js'
import { LobbyHub } from './hub.js'
import { LobbyService } from './service.js'
import type { LobbyPerson, LobbyState } from './types.js'

// No database: the lobby and the /ws/me lookups are mocked, so their calls can be counted
vi.mock('../db/lobbies.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../db/lobbies.js')>()),
  loadLobby: vi.fn(),
  pendingInvitesFor: vi.fn(),
  getOpenLobbyIdOfUser: vi.fn(),
}))

const store = (): EngineStore => ({
  insertSession: vi.fn().mockResolvedValue(undefined),
  getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]),
  appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined),
  deleteDarts: vi.fn().mockResolvedValue(undefined),
  finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
})
const person = (id: string, userId: string, name: string, boardId: string, position: number): LobbyPerson => ({
  id,
  userId,
  addedByUserId: userId,
  name,
  boardId,
  boardName: boardId,
  boardOwnerUserId: userId,
  position,
  plays: true,
  ready: true,
  boardMovedBy: null,
  joinedAt: new Date(0),
  usualBoardName: boardId,
  team: null,
  bot: null,
})
const lobby: LobbyState = {
  id: 'l1',
  name: "Christoph's lobby",
  hostUserId: 'chris',
  code: 'K7Q4MD',
  throwOrder: 'lobby',
  access: 'friends',
  nextGame: { gameId: 'x01', config: x01Module.defaultConfig },
  createdAt: new Date(0),
  closedAt: null,
  people: [person('c', 'chris', 'Christoph', 'living', 0), person('l', 'lena', 'Lena', 'lenas', 1)],
  invites: [],
  activity: [],
}
const sock = () => ({ readyState: 1, send: vi.fn(), close: vi.fn() }) as any
// The last /ws/me state the socket got (friends lists go out on it too)
const lastMe = (ws: { send: { mock: { calls: unknown[][] } } }) =>
  ws.send.mock.calls
    .map(c => JSON.parse(c[0] as string))
    .filter((m: { type: string }) => m.type === 'me')
    .at(-1)
const friendsMsg = { type: 'friends' as const, friends: [], incoming: [], outgoing: [] }
const S1 = { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 } as const

beforeEach(() => {
  vi.mocked(q.loadLobby).mockReset().mockResolvedValue(lobby)
  vi.mocked(q.pendingInvitesFor).mockReset().mockResolvedValue([])
  vi.mocked(q.getOpenLobbyIdOfUser).mockReset().mockResolvedValue('l1')
})

async function lobbyGame() {
  const hub = new LobbyHub()
  const engine = new SessionEngine(store(), vi.fn())
  const lobbies = new LobbyService({ db: {} as Kysely<Database>, engine, hub, isBoardOnline: () => true, warn: vi.fn() })
  const { sessionId } = await engine.createWithSeats({
    ownerUserId: 'chris',
    gameId: 'x01',
    config: x01Module.defaultConfig,
    lobbyId: 'l1',
    lobbyName: lobby.name,
    seats: lobby.people.map(p => ({
      name: p.name,
      userId: p.userId,
      controllerUserId: p.userId!,
      boardId: p.boardId,
      boardName: p.boardName,
      bot: null,
    })),
  })
  // The lobby is loaded in this process, and both members have /ws/me open
  await lobbies.view('l1')
  const chris = sock()
  const lena = sock()
  hub.addMeSocket('chris', chris, await lobbies.meMessage('chris'), friendsMsg)
  hub.addMeSocket('lena', lena, await lobbies.meMessage('lena'), friendsMsg)
  vi.mocked(q.pendingInvitesFor).mockClear()
  vi.mocked(q.getOpenLobbyIdOfUser).mockClear()
  return { engine, lobbies, sessionId, chris, lena }
}

describe('/ws/me during a lobby game', () => {
  it("rebuilds the members' /ws/me only when their indicator changes, not on every dart", async () => {
    const { engine, lobbies, sessionId, lena } = await lobbyGame()
    const meMessage = vi.spyOn(lobbies, 'meMessage')
    await lobbies.onSessionPush(sessionId)
    expect(meMessage).toHaveBeenCalledTimes(2)

    // Darts within Christoph's visit: nobody's indicator changes, no queries run
    for (let i = 0; i < 3; i++) {
      await engine.onUserAction(sessionId, 'chris', { type: 'add_dart', segment: S1 })
      await lobbies.onSessionPush(sessionId)
    }
    // A board going on- or offline: the same
    await lobbies.onSessionPush(sessionId)
    expect(meMessage).toHaveBeenCalledTimes(2)
    expect(q.pendingInvitesFor).toHaveBeenCalledTimes(2)
    expect(q.getOpenLobbyIdOfUser).toHaveBeenCalledTimes(2)
    expect(lastMe(lena).lobby.youThrowNext).toBe(false)

    // Takeout: Lena is up, so both indicators change
    await engine.onUserAction(sessionId, 'chris', { type: 'takeout' })
    await lobbies.onSessionPush(sessionId)
    expect(meMessage).toHaveBeenCalledTimes(4)
    expect(lastMe(lena).lobby).toMatchObject({ sessionId, youThrowNext: true })
  })

  it("pushes again after the game ends, for the lobby's next game", async () => {
    const { engine, lobbies, sessionId } = await lobbyGame()
    await lobbies.onSessionPush(sessionId)
    await lobbies.onGameEnded({
      sessionId,
      lobbyId: 'l1',
      gameId: 'x01',
      status: 'aborted',
      abortedByUserId: 'chris',
      results: [],
      teamGame: false,
      userIds: [],
    })
    await lobbies.whenIdle('l1')
    await engine.deleteSession(sessionId)
    const next = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: x01Module.defaultConfig,
      lobbyId: 'l1',
      lobbyName: lobby.name,
      seats: [{ name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: 'living', boardName: 'living', bot: null }],
    })
    const meMessage = vi.spyOn(lobbies, 'meMessage')
    await lobbies.onSessionPush(next.sessionId)
    expect(meMessage).toHaveBeenCalledTimes(2)
  })

  it('tries again on the next snapshot when a push failed', async () => {
    const { lobbies, sessionId } = await lobbyGame()
    vi.mocked(q.pendingInvitesFor).mockRejectedValueOnce(new Error('db down'))
    await expect(lobbies.onSessionPush(sessionId)).rejects.toThrow('db down')
    const meMessage = vi.spyOn(lobbies, 'meMessage')
    await lobbies.onSessionPush(sessionId)
    expect(meMessage).toHaveBeenCalledTimes(2)
  })
})
