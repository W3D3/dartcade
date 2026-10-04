import { describe, it, expect, vi } from 'vitest'
import { LobbyHub } from './hub.js'

const sock = () => ({ readyState: 1, send: vi.fn(), close: vi.fn() }) as any
const friendsMsg = { type: 'friends' as const, friends: [], incoming: [], outgoing: [] }
const me = (n: number) => ({ type: 'me' as const, invites: [], game: null, lobby: n === 0 ? null : { id: 'l1', name: 'L', hostName: 'Host', peopleCount: n, nextGame: null, sessionId: null, gameId: null, youThrowNext: false, leg: null, youHost: false, solo: n <= 1 } })

describe('LobbyHub', () => {
  it('knows who has a lobby open, and closes one user\'s sockets or everyone\'s', () => {
    const hub = new LobbyHub()
    const a = sock(); const b = sock(); const c = sock()
    hub.addLobbySocket('l1', a, 'chris'); hub.addLobbySocket('l1', b, 'lena'); hub.addLobbySocket('l1', c, 'lena')
    expect(hub.online('l1')).toEqual(new Set(['chris', 'lena']))
    hub.closeLobbyFor('l1', 'lena', 4403, 'left the lobby')
    expect(b.close).toHaveBeenCalledWith(4403, 'left the lobby')
    expect(c.close).toHaveBeenCalledWith(4403, 'left the lobby')
    expect(hub.online('l1')).toEqual(new Set(['chris']))
    hub.closeLobby('l1', 4404, 'lobby closed')
    expect(a.close).toHaveBeenCalledWith(4404, 'lobby closed')
    expect(hub.online('l1')).toEqual(new Set())
  })

  it('sends /ws/me only when it changed', () => {
    const hub = new LobbyHub()
    const ws = sock()
    hub.addMeSocket('lena', ws, me(0), friendsMsg)
    expect(ws.send).toHaveBeenCalledTimes(2)
    hub.sendMe('lena', me(0))
    expect(ws.send).toHaveBeenCalledTimes(2)
    hub.sendMe('lena', me(2))
    expect(ws.send).toHaveBeenCalledTimes(3)
    expect(hub.hasMe('lena')).toBe(true)
    hub.removeMeSocket('lena', ws)
    expect(hub.hasMe('lena')).toBe(false)
  })

  it('sends the friends list only when it changed', () => {
    const hub = new LobbyHub()
    const ws = sock()
    hub.addMeSocket('lena', ws, me(0), friendsMsg)
    hub.sendFriends('lena', friendsMsg)
    expect(ws.send).toHaveBeenCalledTimes(2)
    hub.sendFriends('lena', { ...friendsMsg, incoming: [{ id: 'f1', from: { id: 'max', name: 'Max' }, mutualFriends: 0, createdAt: '2026-10-04T10:00:00.000Z' }] })
    expect(ws.send).toHaveBeenCalledTimes(3)
    hub.sendFriends('max', friendsMsg)   // no /ws/me open: nothing to send to
    expect(ws.send).toHaveBeenCalledTimes(3)
  })

  it('a second tab clears the last friends list, so the next push reaches every tab', () => {
    const hub = new LobbyHub()
    const a = sock(); const b = sock()
    const changed = { ...friendsMsg, outgoing: [{ id: 'f1', to: { id: 'max', name: 'Max' }, createdAt: '2026-10-04T10:00:00.000Z' }] }
    hub.addMeSocket('lena', a, me(0), friendsMsg)
    hub.addMeSocket('lena', b, me(0), changed)   // built after a change tab a hasn't got yet
    hub.sendFriends('lena', changed)
    expect(JSON.parse(String(a.send.mock.calls.at(-1)?.[0]))).toEqual(changed)
  })

  it('forgets the last friends list once the last /ws/me closes', () => {
    const hub = new LobbyHub()
    const a = sock()
    hub.addMeSocket('lena', a, me(0), friendsMsg)
    hub.removeMeSocket('lena', a)
    const b = sock()
    hub.addMeSocket('lena', b, me(0), friendsMsg)
    hub.removeMeSocket('lena', b)
    hub.addMeSocket('lena', sock(), me(0), friendsMsg)
    hub.sendFriends('lena', friendsMsg)
    expect(b.send).toHaveBeenCalledTimes(2)
  })
})
