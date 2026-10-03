import { describe, it, expect, vi } from 'vitest'
import { LobbyHub } from './hub.js'

const sock = () => ({ readyState: 1, send: vi.fn(), close: vi.fn() }) as any
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
    hub.addMeSocket('lena', ws, me(0))
    expect(ws.send).toHaveBeenCalledTimes(1)
    hub.sendMe('lena', me(0))
    expect(ws.send).toHaveBeenCalledTimes(1)
    hub.sendMe('lena', me(2))
    expect(ws.send).toHaveBeenCalledTimes(2)
    expect(hub.hasMe('lena')).toBe(true)
    hub.removeMeSocket('lena', ws)
    expect(hub.hasMe('lena')).toBe(false)
  })
})
