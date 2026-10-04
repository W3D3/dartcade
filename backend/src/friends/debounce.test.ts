import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KeyedDebounce } from './debounce.js'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('KeyedDebounce', () => {
  it('runs each key once per burst, 250 ms after its first change', () => {
    const run = vi.fn()
    const d = new KeyedDebounce(250, run)
    d.schedule('chris'); d.schedule('chris'); d.schedule('lena')
    vi.advanceTimersByTime(249)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run.mock.calls).toEqual([['chris'], ['lena']])
    d.schedule('chris')
    vi.advanceTimersByTime(250)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('flush runs what is pending now', () => {
    const run = vi.fn()
    const d = new KeyedDebounce(250, run)
    d.schedule('chris')
    expect(d.pending()).toBe(1)
    d.flush()
    expect(run).toHaveBeenCalledWith('chris')
    expect(d.pending()).toBe(0)
    vi.advanceTimersByTime(250)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cancel drops what is pending without running it', () => {
    const run = vi.fn()
    const d = new KeyedDebounce(250, run)
    d.schedule('chris'); d.schedule('lena')
    d.cancel()
    expect(d.pending()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(250)
    expect(run).not.toHaveBeenCalled()
  })
})
