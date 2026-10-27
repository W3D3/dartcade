import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { createBigScreenStore } from '../bigscreen/store.js'
import snapshot from './fixtures/x01-snapshot.json'

class FakeSocket {
  static opened: FakeSocket[] = []
  static OPEN = 1
  readyState = 1
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(readonly url: string) {
    FakeSocket.opened.push(this)
  }
  send(d: string) {
    this.sent.push(d)
  }
  close() {
    this.closed = true
  }
  receive(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) })
  }
}
const open = (url: string) => new FakeSocket(url) as unknown as WebSocket

const board = { id: 'b1', name: 'Garage', online: true }
const idle = { type: 'big_screen', board, prefs: {}, screen: { kind: 'idle' } }

beforeEach(() => {
  FakeSocket.opened = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createBigScreenStore', () => {
  it('connects to /ws/board and sends the token first on every open', () => {
    const s = createBigScreenStore('b 1', 'abc', open)
    const first = FakeSocket.opened[0]
    expect(first.url).toBe('/ws/board?boardId=b%201')
    first.onopen?.()
    expect(first.sent).toEqual(['{"type":"auth","token":"abc"}'])
    expect(get(s.connected)).toBe(true)
    first.onclose?.({ code: 1006 })
    expect(get(s.connected)).toBe(false)
    vi.advanceTimersByTime(500)
    const second = FakeSocket.opened[1]
    second.onopen?.()
    expect(second.sent).toEqual(['{"type":"auth","token":"abc"}'])
    s.destroy()
  })

  it('stops for good and clears the message when the token is refused', () => {
    const s = createBigScreenStore('b1', 'abc', open)
    FakeSocket.opened[0].receive(idle)
    FakeSocket.opened[0].onclose?.({ code: 4403 })
    expect(get(s.stopped)).toBe(true)
    expect(get(s.message)).toBeNull()
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
    s.destroy()
  })

  it('does not stop on an abnormal close', () => {
    const s = createBigScreenStore('b1', 'abc', open)
    FakeSocket.opened[0].onclose?.({ code: 1006 })
    expect(get(s.stopped)).toBe(false)
    s.destroy()
  })

  it('sends nothing without a token', () => {
    const s = createBigScreenStore('b1', null, open)
    FakeSocket.opened[0].onopen?.()
    expect(FakeSocket.opened[0].sent).toEqual([])
    s.destroy()
  })

  it('keeps messages, and shows a snapshot it cannot read as idle', () => {
    const s = createBigScreenStore('b1', null, open)
    FakeSocket.opened[0].receive(idle)
    expect(get(s.message)?.screen).toEqual({ kind: 'idle' })
    FakeSocket.opened[0].receive({ ...idle, screen: { kind: 'game', snapshot: { type: 'snapshot', gameId: 'nope' } } })
    expect(get(s.message)?.screen).toEqual({ kind: 'idle' })
    FakeSocket.opened[0].receive({ hello: 1 })
    expect(get(s.message)?.board.name).toBe('Garage')
    s.destroy()
  })

  it('destroy closes the socket and stops reconnecting', () => {
    const s = createBigScreenStore('b1', null, open)
    s.destroy()
    expect(FakeSocket.opened[0].closed).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
  })

  it('keeps the saved game of a result', () => {
    const s = createBigScreenStore('b1', null, open)
    const detail = { game: { players: [] }, detail: { mode: 'x01', legs: [] }, stats: { rows: [], seats: [] } }
    FakeSocket.opened[0].receive({ ...idle, screen: { kind: 'result', snapshot, until: 1, detail } })
    expect(get(s.message)?.screen).toMatchObject({ kind: 'result', detail })
    s.destroy()
  })
})
