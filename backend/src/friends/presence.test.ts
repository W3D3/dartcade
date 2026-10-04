import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Presence } from './presence.js'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('Presence', () => {
  it('is online from the first socket, offline 30 s after the last one closes', () => {
    const changed = vi.fn()
    const p = new Presence(changed)
    p.connect('lena')
    expect(p.isOnline('lena')).toBe(true)
    expect(changed).toHaveBeenCalledTimes(1)
    p.disconnect('lena')
    vi.advanceTimersByTime(29_999)
    expect(p.isOnline('lena')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(p.isOnline('lena')).toBe(false)
    expect(changed).toHaveBeenCalledTimes(2)
    expect(changed).toHaveBeenLastCalledWith('lena')
  })

  it('stays online while another socket is open; a reload within the grace never shows offline', () => {
    const changed = vi.fn()
    const p = new Presence(changed)
    p.connect('lena')
    p.connect('lena')
    p.disconnect('lena')
    vi.advanceTimersByTime(60_000)
    expect(p.isOnline('lena')).toBe(true)
    p.disconnect('lena')
    vi.advanceTimersByTime(10_000)
    p.connect('lena')
    vi.advanceTimersByTime(60_000)
    expect(p.isOnline('lena')).toBe(true)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('ignores a close it never saw open', () => {
    const changed = vi.fn()
    const p = new Presence(changed)
    p.disconnect('ghost')
    vi.advanceTimersByTime(60_000)
    expect(p.isOnline('ghost')).toBe(false)
    expect(changed).not.toHaveBeenCalled()
  })

  it('close stops the grace timers and leaves no new ones behind', () => {
    const changed = vi.fn()
    const p = new Presence(changed)
    p.connect('lena')
    p.connect('max')
    p.disconnect('lena')
    expect(vi.getTimerCount()).toBe(1)
    p.close()
    expect(vi.getTimerCount()).toBe(0)
    p.disconnect('max')   // sockets closing as the server stops
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(changed).toHaveBeenCalledTimes(2)   // the two connects only
  })
})
