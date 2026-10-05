import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { createNameCheck, nameHint, nameSendable, nameStatusText, normalizeName } from '../names.js'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('nameHint', () => {
  it('explains what is wrong while typing, null when the rules are met', () => {
    expect(nameHint('Phil Taylor')).toBe('No spaces: try a . or _ instead')
    expect(nameHint('x')).toBe('At least 2 characters')
    expect(nameHint('a'.repeat(21))).toBe('20 characters at most')
    expect(nameHint('luke!')).toBe('Only letters, digits, . _ and -')
    expect(nameHint(' Jürgen ')).toBeNull()
    expect(normalizeName(' Jürgen ')).toBe('Jürgen')
  })
})

describe('createNameCheck', () => {
  it('asks the server after a quiet moment; only the latest answer counts', async () => {
    const lookup = vi.fn((name: string) =>
      Promise.resolve(name === 'Luke' ? { available: false, reason: 'taken' as const } : { available: true }),
    )
    const c = createNameCheck(lookup, () => null)
    c.check('Lu')
    c.check('Luke')
    expect(get(c.status)).toEqual({ kind: 'checking' })
    await vi.advanceTimersByTimeAsync(300)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(get(c.status)).toEqual({ kind: 'taken', name: 'Luke' })
    c.check('Luke2')
    await vi.advanceTimersByTimeAsync(300)
    expect(get(c.status)).toEqual({ kind: 'available', name: 'Luke2', own: false })
  })

  it('knows your own name without asking, and says so', async () => {
    const lookup = vi.fn()
    const c = createNameCheck(lookup, () => 'Luke')
    c.check(' Luke ')
    await vi.advanceTimersByTimeAsync(300)
    expect(lookup).not.toHaveBeenCalled()
    expect(get(c.status)).toEqual({ kind: 'available', name: 'Luke', own: true })
    expect(nameStatusText(get(c.status))).toBe("That's your name")
  })

  it('rule breakers never reach the server; a failed check still lets you send', async () => {
    const lookup = vi.fn(() => Promise.resolve(null))
    const c = createNameCheck(lookup, () => null)
    c.check('a b')
    expect(get(c.status)).toEqual({ kind: 'invalid', hint: 'No spaces: try a . or _ instead' })
    expect(nameSendable(get(c.status))).toBe(false)
    c.check('sam.180')
    await vi.advanceTimersByTimeAsync(300)
    expect(get(c.status)).toEqual({ kind: 'unknown' })
    expect(nameSendable(get(c.status))).toBe(true)
  })
})
