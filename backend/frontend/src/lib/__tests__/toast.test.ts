import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { createToast } from '../toast.js'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createToast', () => {
  it('shows a value for the given time', () => {
    const t = createToast<string>(6000)
    expect(get(t)).toBeNull()
    t.show('a')
    expect(get(t)?.value).toBe('a')
    vi.advanceTimersByTime(5999)
    expect(get(t)?.value).toBe('a')
    vi.advanceTimersByTime(1)
    expect(get(t)).toBeNull()
  })

  it('a newer value replaces it and starts the time again, with a new id', () => {
    const t = createToast<string>(6000)
    t.show('a')
    const first = get(t)?.id
    vi.advanceTimersByTime(4000)
    t.show('b')
    expect(get(t)?.value).toBe('b')
    expect(get(t)?.id).not.toBe(first)
    vi.advanceTimersByTime(4000)
    expect(get(t)?.value).toBe('b')
    vi.advanceTimersByTime(2000)
    expect(get(t)).toBeNull()
  })

  it('dismiss hides it at once', () => {
    const t = createToast<string>(6000)
    t.show('a')
    t.dismiss()
    expect(get(t)).toBeNull()
    vi.advanceTimersByTime(6000)
    expect(get(t)).toBeNull()
  })
})
