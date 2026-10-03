import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from '../session/engine.js'
import { x01Module } from '../games/x01.js'
import type { LobbyPerson, LobbyState } from './types.js'
import { inviteView, lobbySummary, lobbyView } from './view.js'
import { checkLobbyMessage } from './validation.js'

const store = (): EngineStore => ({
  insertSession: vi.fn().mockResolvedValue(undefined), getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]), appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined), finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
})
const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p', userId: null, addedByUserId: 'chris', name: 'X', boardId: null, boardName: null, boardOwnerUserId: null,
  position: 0, plays: true, ready: false, boardMovedBy: null, joinedAt: new Date(0), usualBoardName: null, ...over,
})
const at = new Date(Date.UTC(2026, 9, 2, 18, 0))
const lobby: LobbyState = {
  id: 'l1', name: "Christoph's lobby", hostUserId: 'chris', code: 'K7Q4MD', throwOrder: 'lobby',
  nextGame: { gameId: 'x01', config: { startScore: 501 } }, createdAt: at, closedAt: null,
  people: [
    person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris', usualBoardName: 'Living room' }),
    person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris', boardMovedBy: 'chris' }),
    person({ id: 'g', name: 'Guest 1', ready: true }),
  ],
  invites: [{ id: 'i1', userId: 'lena', name: 'Lena', invitedByUserId: 'chris', createdAt: at }],
  activity: [{ id: '7', at, kind: 'joined', actorUserId: 'max', actorName: 'Max', data: { name: 'Max' } }],
}

describe('lobbyView', () => {
  it('shows presence for members, boards online, and dates as ISO strings', () => {
    const view = lobbyView(lobby, { online: new Set(['chris']), isBoardOnline: b => b === 'living', sessionId: null })
    expect(view.people.map(p => [p.name, p.presence, p.boardOnline, p.boardMovedBy])).toEqual([
      ['Christoph', 'online', true, null],
      ['Max', 'away', true, 'chris'],
      ['Guest 1', null, false, null],
    ])
    expect(view).toMatchObject({ currentSessionId: null, createdAt: at.toISOString() })
    expect(view.invites).toEqual([{ id: 'i1', userId: 'lena', name: 'Lena', invitedByUserId: 'chris', createdAt: at.toISOString() }])
    expect(() => { checkLobbyMessage({ type: 'lobby', lobby: view }, () => undefined) }).not.toThrow()
  })

  it('is not solo with two members, and names who would take over as host', () => {
    const notSolo: LobbyState = {
      ...lobby,
      people: [
        person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph' }),
        person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena' }),
        person({ id: 'g', name: 'Guest 1' }),
      ],
      invites: [],
    }
    const view = lobbyView(notSolo, { online: new Set(), isBoardOnline: () => false, sessionId: null })
    expect(view.solo).toBe(false)
    expect(view.nextHostName).toBe('Lena')
  })

  it('names the host, like the /ws/me summary; null with no host in it', () => {
    const two: LobbyState = {
      ...lobby,
      hostUserId: 'lena',
      people: [
        person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph' }),
        person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena' }),
      ],
      invites: [],
    }
    const ctx = { online: new Set<string>(), isBoardOnline: () => false, sessionId: null }
    expect(lobbyView(two, ctx).hostName).toBe('Lena')
    expect(lobbyView({ ...two, hostUserId: null }, ctx).hostName).toBeNull()
    expect(lobbyView({ ...two, hostUserId: 'gone' }, ctx).hostName).toBeNull()
  })

  it('a guest\'s ready follows their adder\'s, not their own stored flag', () => {
    const withGuest: LobbyState = {
      ...lobby,
      people: [
        person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', ready: false }),
        person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena', ready: true }),
        person({ id: 'g1', name: 'Chris\'s guest', addedByUserId: 'chris', ready: true }),
        person({ id: 'g2', name: 'Lena\'s guest', addedByUserId: 'lena', ready: false }),
      ],
      invites: [],
    }
    const view = lobbyView(withGuest, { online: new Set(), isBoardOnline: () => false, sessionId: null })
    expect(view.people.map(p => [p.name, p.ready])).toEqual([
      ['Christoph', false], ['Lena', true], ["Chris's guest", false], ["Lena's guest", true],
    ])
  })

  it('is solo with just the host, a guest and a pending invite; nobody would take over', () => {
    const solo: LobbyState = {
      ...lobby,
      people: [
        person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph' }),
        person({ id: 'g', name: 'Guest 1' }),
      ],
      invites: [{ id: 'i1', userId: 'lena', name: 'Lena', invitedByUserId: 'chris', createdAt: at }],
    }
    const view = lobbyView(solo, { online: new Set(), isBoardOnline: () => false, sessionId: null })
    expect(view.solo).toBe(true)
    expect(view.nextHostName).toBeNull()
  })
})

describe('lobbySummary', () => {
  it('says whose turn it is in the lobby\'s game, and the leg', async () => {
    const engine = new SessionEngine(store(), vi.fn())
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris', gameId: 'x01', config: x01Module.defaultConfig, lobbyId: 'l1', lobbyName: lobby.name,
      seats: [
        { name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: null, boardName: null },
        { name: 'Max', userId: 'max', controllerUserId: 'max', boardId: null, boardName: null },
      ],
    })
    const session = engine.getSession(sessionId)
    expect(lobbySummary(lobby, 'chris', session)).toEqual({
      id: 'l1', name: "Christoph's lobby", hostName: 'Christoph', peopleCount: 3, nextGame: { gameId: 'x01', config: { startScore: 501 } },
      sessionId, gameId: 'x01', youThrowNext: true, leg: 0, youHost: true, solo: false,
    })
    expect(lobbySummary(lobby, 'max', session).youThrowNext).toBe(false)
    expect(lobbySummary(lobby, 'max', session).youHost).toBe(false)
    expect(lobbySummary(lobby, 'max', undefined)).toMatchObject({ sessionId: null, gameId: null, youThrowNext: false, leg: null })
    const me = { type: 'me' as const, invites: [inviteView({ id: 'i1', lobbyId: 'l1', lobbyName: 'L', inviterUserId: null, inviterName: null, createdAt: at })], game: null, lobby: lobbySummary(lobby, 'chris', session) }
    expect(() => { checkLobbyMessage(me, () => undefined) }).not.toThrow()
  })

  it('names the host; null only once their account is gone', () => {
    expect(lobbySummary(lobby, 'max', undefined).hostName).toBe('Christoph')
    const hostless: LobbyState = { ...lobby, hostUserId: null }
    expect(lobbySummary(hostless, 'max', undefined).hostName).toBeNull()
  })
})

describe('checkLobbyMessage', () => {
  it('throws in tests when a message doesn\'t match the schema', () => {
    expect(() => { checkLobbyMessage({ type: 'me', invites: [], lobby: { id: 1 } } as any, () => undefined) }).toThrow(/lobby-ws-v1/)
  })
})
