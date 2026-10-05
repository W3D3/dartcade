import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reconnectingSocket, type SocketHandlers } from '../reconnectingSocket.js'

// A stand-in for the browser's WebSocket: tests open, message and close it by hand
class FakeSocket {
  static opened: FakeSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  sent: string[] = []
  constructor(readonly url: string) {
    FakeSocket.opened.push(this)
  }
  close() {
    this.closed = true
  }
  send(data: string) {
    this.sent.push(data)
  }
  drop(code = 1006) {
    this.onclose?.({ code })
  }
}
const open = (url: string) => new FakeSocket(url) as unknown as WebSocket
const last = () => FakeSocket.opened[FakeSocket.opened.length - 1]

function start(handlers: Partial<SocketHandlers> = {}) {
  return reconnectingSocket('/ws/test', { onMessage: () => undefined, ...handlers }, open)
}

/** Advances time until the next socket opens and returns how long that took. */
function waitForReconnect(): number {
  const before = FakeSocket.opened.length
  let waited = 0
  while (FakeSocket.opened.length === before && waited < 120_000) {
    vi.advanceTimersByTime(100)
    waited += 100
  }
  return waited
}

beforeEach(() => {
  FakeSocket.opened = []
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('reconnectingSocket', () => {
  it('opens the url right away', () => {
    const s = start()
    expect(FakeSocket.opened).toHaveLength(1)
    expect(FakeSocket.opened[0].url).toBe('/ws/test')
    s.stop()
  })

  it('waits 500 ms after a drop, doubling up to 30 s', () => {
    const s = start()
    const waits: number[] = []
    for (let i = 0; i < 9; i++) {
      last().drop()
      waits.push(waitForReconnect())
    }
    expect(waits).toEqual([500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000])
    s.stop()
  })

  it('goes back to 500 ms once a connection delivers a message', () => {
    const onOpen = vi.fn()
    const s = start({ onOpen })
    last().drop()
    waitForReconnect()
    last().drop()
    expect(waitForReconnect()).toBe(1000)
    last().onopen?.()
    expect(onOpen).toHaveBeenCalledOnce()
    last().onmessage?.({ data: '{}' })
    last().drop()
    expect(waitForReconnect()).toBe(500)
    s.stop()
  })

  it('keeps backing off when a server accepts and closes without a message', () => {
    const s = start()
    const waits: number[] = []
    for (let i = 0; i < 8; i++) {
      last().onopen?.()
      last().drop(1011)
      waits.push(waitForReconnect())
    }
    expect(waits).toEqual([500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000])
    s.stop()
  })

  it('passes parsed JSON on and drops the rest', () => {
    const onMessage = vi.fn()
    const s = start({ onMessage })
    last().onmessage?.({ data: JSON.stringify({ type: 'hello' }) })
    last().onmessage?.({ data: '{broken' })
    last().onmessage?.({ data: new ArrayBuffer(2) })
    expect(onMessage.mock.calls).toEqual([[{ type: 'hello' }]])
    s.stop()
  })

  it('sends on the current socket', () => {
    const s = start()
    s.send('x')
    expect(FakeSocket.opened[0].sent).toEqual(['x'])
    s.stop()
  })

  it('stop() closes the socket and cancels a pending reconnect', () => {
    const s = start()
    last().drop()
    s.stop()
    expect(s.stopped).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)

    const t = start()
    t.stop()
    expect(last().closed).toBe(true)
  })

  it("ignores a stopped socket's late events", () => {
    const onMessage = vi.fn()
    const onClose = vi.fn()
    const s = start({ onMessage, onClose })
    const socket = last()
    s.stop()
    socket.onmessage?.({ data: '{}' })
    socket.drop()
    expect(onMessage).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
  })

  it("ignores a replaced socket's events", () => {
    const onMessage = vi.fn()
    const onClose = vi.fn()
    const s = start({ onMessage, onClose })
    const old = last()
    old.drop()
    waitForReconnect()
    expect(onClose).toHaveBeenCalledOnce()
    // The old socket fires again after its replacement opened
    old.onmessage?.({ data: '{}' })
    old.drop()
    expect(onMessage).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(2)
    s.stop()
  })

  it('lets onClose stop it for good by close code', () => {
    const codes: number[] = []
    const s = start({
      onClose: code => {
        codes.push(code)
        return code === 4401 ? 'stop' : undefined
      },
    })
    last().drop(1006)
    waitForReconnect()
    expect(s.stopped).toBe(false)
    last().drop(4401)
    vi.advanceTimersByTime(60_000)
    expect(codes).toEqual([1006, 4401])
    expect(FakeSocket.opened).toHaveLength(2)
    expect(s.stopped).toBe(true)
  })

  it('stays stopped when a handler calls stop() itself', () => {
    const s = start({
      onClose: () => {
        s.stop()
        return undefined
      },
    })
    last().drop()
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
  })
})
