import { describe, it, expect } from 'vitest'
import { createRequestGuard } from '../requestGuard.js'

describe('createRequestGuard', () => {
  it('is current from the start, with no sequence started yet', () => {
    const g = createRequestGuard()
    expect(g.isCurrent(g.current())).toBe(true)
  })

  it('a token is stale once a newer sequence has started', () => {
    const g = createRequestGuard()
    const a = g.start()
    expect(g.isCurrent(a)).toBe(true)
    const b = g.start()
    expect(g.isCurrent(a)).toBe(false)
    expect(g.isCurrent(b)).toBe(true)
  })

  it('current() lets a continuation (e.g. load more) share the active token', () => {
    const g = createRequestGuard()
    const a = g.start()
    const continuation = g.current()
    expect(continuation).toBe(a)
    expect(g.isCurrent(continuation)).toBe(true)
    g.start()
    expect(g.isCurrent(continuation)).toBe(false)
  })
})
