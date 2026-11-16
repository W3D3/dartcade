import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { WsCloseCode } from '../schema/game-ws.js'
import { cutDevices, trackDevice } from './deviceSockets.js'

const fakeSocket = () => Object.assign(new EventEmitter(), { close: vi.fn() }) as unknown as WebSocket & { close: ReturnType<typeof vi.fn> }

describe('venue device sockets', () => {
  it('revoking a device closes all its sockets and no one else', () => {
    const a1 = fakeSocket()
    const a2 = fakeSocket()
    const b = fakeSocket()
    trackDevice('a', a1)
    trackDevice('a', a2)
    trackDevice('b', b)
    cutDevices(['a'])
    expect(a1.close).toHaveBeenCalledWith(WsCloseCode.Unauthorized, 'device revoked')
    expect(a2.close).toHaveBeenCalled()
    expect(b.close).not.toHaveBeenCalled()
  })

  it('forgets a socket that closed', () => {
    const s = fakeSocket()
    trackDevice('c', s)
    s.emit('close')
    cutDevices(['c'])
    expect(s.close).not.toHaveBeenCalled()
  })
})
