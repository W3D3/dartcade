import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { createLobbyStore, createMeStore, parseLobbyMessage, parseMeMessage } from '../lobby/sockets.js'

// A stand-in for the browser's WebSocket: tests push messages and closes into it
class FakeSocket {
  static opened: FakeSocket[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(readonly url: string) { FakeSocket.opened.push(this) }
  close() { this.closed = true }
  receive(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }) }
  drop(code: number) { this.onclose?.({ code }) }
}
const open = (url: string) => new FakeSocket(url) as unknown as WebSocket

const lobby = {
  id: 'l1', name: 'Friday darts', code: 'K7Q4MD', hostUserId: 'chris', hostName: null, throwOrder: 'lobby', nextGame: null,
  currentSessionId: null, createdAt: '2026-10-02T19:40:00.000Z', people: [], invites: [], activity: [], solo: true, nextHostName: null,
}
const meMsg = { type: 'me', invites: [], game: null, lobby: {
  id: 'l1', name: 'Friday darts', hostName: 'Christoph', peopleCount: 2, nextGame: null, sessionId: null, gameId: null, youThrowNext: false, leg: null, youHost: true, solo: false,
} }

beforeEach(() => { FakeSocket.opened = []; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('parsing', () => {
  it('takes lobby snapshots and the closed message; drops the rest quietly', () => {
    expect(parseLobbyMessage({ type: 'lobby', lobby })?.type).toBe('lobby')
    expect(parseLobbyMessage({ type: 'lobby_closed', lobbyId: 'l1' })).toEqual({ type: 'lobby_closed', lobbyId: 'l1' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(parseLobbyMessage({ type: 'hello' })).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    expect(parseLobbyMessage({ type: 'lobby', lobby: { id: 1 } })).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('takes the per-user message', () => {
    expect(parseMeMessage(meMsg)?.lobby?.youHost).toBe(true)
    expect(parseMeMessage({ type: 'me', invites: 'x' })).toBeNull()
  })
})

describe('createLobbyStore', () => {
  it('opens the lobby socket and keeps the latest snapshot', () => {
    const s = createLobbyStore('l1', open)
    expect(FakeSocket.opened[0].url).toBe('/ws/lobby?lobbyId=l1')
    FakeSocket.opened[0].receive({ type: 'lobby', lobby })
    expect(get(s.lobby)?.name).toBe('Friday darts')
    s.destroy()
  })

  it('reconnects after a dropped connection', () => {
    const s = createLobbyStore('l1', open)
    FakeSocket.opened[0].drop(1006)
    vi.advanceTimersByTime(600)
    expect(FakeSocket.opened).toHaveLength(2)
    s.destroy()
  })

  it('stops on 4403/4404: you left or were removed, or the lobby closed', () => {
    const a = createLobbyStore('l1', open)
    FakeSocket.opened[0].drop(4403)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
    expect(get(a.ended)).toBe('left')
    const b = createLobbyStore('l1', open)
    FakeSocket.opened[1].drop(4404)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(2)
    expect(get(b.ended)).toBe('closed')
  })

  it('a lobby_closed message ends it too, and stops the socket', () => {
    const s = createLobbyStore('l1', open)
    FakeSocket.opened[0].receive({ type: 'lobby_closed', lobbyId: 'l1' })
    expect(get(s.ended)).toBe('closed')
    expect(FakeSocket.opened[0].closed).toBe(true)
  })
})

describe('createMeStore', () => {
  it('starts on demand, keeps the latest message, stops for good', () => {
    const m = createMeStore(open)
    expect(FakeSocket.opened).toHaveLength(0)
    m.start()
    m.start()
    expect(FakeSocket.opened).toHaveLength(1)
    expect(FakeSocket.opened[0].url).toBe('/ws/me')
    FakeSocket.opened[0].receive(meMsg)
    expect(get(m)?.lobby?.name).toBe('Friday darts')
    m.stop()
    expect(get(m)).toBeNull()
    FakeSocket.opened[0].drop(1006)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
  })

  it('carries the running game from /ws/me, live (#69)', () => {
    const m = createMeStore(open)
    m.start()
    FakeSocket.opened[0].receive({ ...meMsg, game: { sessionId: 's1', gameId: 'x01', lobbyName: 'Friday darts', players: ['Christoph', 'Lena'] } })
    expect(get(m)?.game).toEqual({ sessionId: 's1', gameId: 'x01', lobbyName: 'Friday darts', players: ['Christoph', 'Lena'] })
    FakeSocket.opened[0].receive({ ...meMsg, game: null })
    expect(get(m)?.game).toBeNull()
  })

  it('gives up when signed out (4401), and starts again after signing back in', () => {
    const m = createMeStore(open)
    m.start()
    expect(m.running()).toBe(true)
    FakeSocket.opened[0].drop(4401)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
    expect(m.running()).toBe(false)
    m.start()
    expect(FakeSocket.opened).toHaveLength(2)
    expect(m.running()).toBe(true)
  })

  it('stop() cancels a pending reconnect, so a restart leaves one socket', () => {
    const m = createMeStore(open)
    m.start()
    FakeSocket.opened[0].drop(1006)
    m.stop()
    m.start()
    expect(FakeSocket.opened).toHaveLength(2)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(2)
  })
})
