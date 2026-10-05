import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { isOpen, onceGone } from './socket.js'

class FakeSocket extends EventEmitter {
  readonly OPEN = 1
  readyState = 1
}

describe('isOpen', () => {
  it('reads the socket state each time', () => {
    const socket = new FakeSocket()
    expect(isOpen(socket as any)).toBe(true)
    socket.readyState = 3
    expect(isOpen(socket as any)).toBe(false)
  })
})

describe('onceGone', () => {
  it('runs once for an error followed by a close', () => {
    const socket = new FakeSocket()
    const gone = vi.fn()
    onceGone(socket as any, gone)
    socket.emit('error', new Error('reset'))
    socket.emit('close')
    expect(gone).toHaveBeenCalledTimes(1)
  })

  it('runs once for a close alone', () => {
    const socket = new FakeSocket()
    const gone = vi.fn()
    onceGone(socket as any, gone)
    socket.emit('close')
    socket.emit('close')
    expect(gone).toHaveBeenCalledTimes(1)
  })
})
