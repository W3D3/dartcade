import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WaitGate } from '../waitGate.svelte'

describe('WaitGate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows after the delay, not before', () => {
    const gate = new WaitGate({ delay: 150, timeout: 12_000 })
    vi.advanceTimersByTime(149)
    expect(gate.shown).toBe(false)
    vi.advanceTimersByTime(1)
    expect(gate.shown).toBe(true)
  })

  it('never shows when destroyed inside the delay (the load was fast)', () => {
    const gate = new WaitGate({ delay: 150, timeout: 12_000 })
    vi.advanceTimersByTime(100)
    gate.destroy()
    vi.advanceTimersByTime(20_000)
    expect(gate.shown).toBe(false)
    expect(gate.slow).toBe(false)
  })

  it('goes slow after the timeout', () => {
    const gate = new WaitGate({ delay: 150, timeout: 12_000 })
    vi.advanceTimersByTime(11_999)
    expect(gate.slow).toBe(false)
    vi.advanceTimersByTime(1)
    expect(gate.slow).toBe(true)
  })

  it('starts the wait again on restart', () => {
    const gate = new WaitGate({ delay: 150, timeout: 12_000 })
    vi.advanceTimersByTime(12_000)
    expect(gate.slow).toBe(true)
    gate.restart()
    expect(gate.slow).toBe(false)
    expect(gate.shown).toBe(false)
    vi.advanceTimersByTime(150)
    expect(gate.shown).toBe(true)
    vi.advanceTimersByTime(12_000)
    expect(gate.slow).toBe(true)
  })

  it('shows at once with no delay', () => {
    expect(new WaitGate({ delay: 0 }).shown).toBe(true)
  })
})
