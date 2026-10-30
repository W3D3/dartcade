import { describe, it, expect } from 'vitest'
import { isDisposable, assertPermanentEmail, DISPOSABLE_EMAIL } from './disposableGate.js'

describe('disposable email check', () => {
  it('blocks a listed domain, case-insensitively', () => {
    expect(isDisposable('a@minafter.com')).toBe(true)
    expect(isDisposable('a@MinAfter.COM')).toBe(true)
  })
  it('blocks a subdomain of a listed domain', () => {
    expect(isDisposable('a@foo.minafter.com')).toBe(true)
  })
  it('lets a normal domain through, even one that merely ends the same', () => {
    expect(isDisposable('a@gmail.com')).toBe(false)
    expect(isDisposable('a@notminafter.com')).toBe(false)
  })
  it('honours the allowlist and the * switch', () => {
    expect(isDisposable('a@minafter.com', ['minafter.com'])).toBe(false)
    expect(isDisposable('a@x.minafter.com', ['minafter.com'])).toBe(false)
    expect(() => assertPermanentEmail('a@minafter.com', ['*'])).not.toThrow()
  })
  it('rejects with a readable message', () => {
    expect(() => assertPermanentEmail('a@minafter.com', [])).toThrow(DISPOSABLE_EMAIL)
  })
})
