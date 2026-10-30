import { describe, it, expect, vi } from 'vitest'
import { isDisposable, assertPermanentEmail, disposableList, DISPOSABLE_EMAIL } from './disposableGate.js'

const blocked = new Set(['minafter.com'])
const listOf = (text: string) => disposableList(() => Promise.resolve(text))

describe('disposable email check', () => {
  it('blocks a listed domain, case-insensitively', () => {
    expect(isDisposable('a@minafter.com', blocked)).toBe(true)
    expect(isDisposable('a@MinAfter.COM', blocked)).toBe(true)
  })
  it('blocks a subdomain of a listed domain', () => {
    expect(isDisposable('a@foo.minafter.com', blocked)).toBe(true)
  })
  it('lets a normal domain through, even one that merely ends the same', () => {
    expect(isDisposable('a@gmail.com', blocked)).toBe(false)
    expect(isDisposable('a@notminafter.com', blocked)).toBe(false)
  })
  it('honours the allowlist and the * switch', async () => {
    expect(isDisposable('a@minafter.com', blocked, ['minafter.com'])).toBe(false)
    expect(isDisposable('a@x.minafter.com', blocked, ['minafter.com'])).toBe(false)
    await expect(assertPermanentEmail('a@minafter.com', ['*'], listOf('minafter.com\n'))).resolves.toBeUndefined()
  })
  it('rejects with a readable message, using the fetched list', async () => {
    const list = listOf('Minafter.com\n\n')
    await expect(assertPermanentEmail('a@minafter.com', [], list)).rejects.toThrow(DISPOSABLE_EMAIL)
    await expect(assertPermanentEmail('a@gmail.com', [], list)).resolves.toBeUndefined()
  })
  it('fails open when the list cannot be fetched, and retries later', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchList = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(assertPermanentEmail('a@minafter.com', [], disposableList(fetchList))).resolves.toBeUndefined()
    expect(fetchList).toHaveBeenCalledOnce()
  })
})
