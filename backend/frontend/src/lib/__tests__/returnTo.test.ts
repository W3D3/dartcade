import { describe, it, expect } from 'vitest'
import { rememberReturn, takeReturn } from '../returnTo.js'

function memory(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size },
  }
}

describe('return after sign-in', () => {
  it('remembers the page a signed-out visitor opened, once', () => {
    const s = memory()
    rememberReturn(s, '#/join/K7Q4MD')
    expect(takeReturn(s)).toBe('/join/K7Q4MD')
    // Taken: the next sign-in goes home
    expect(takeReturn(s)).toBe('/')
  })

  it('keeps a query string', () => {
    const s = memory()
    rememberReturn(s, '#/?board=b1')
    expect(takeReturn(s)).toBe('/?board=b1')
  })

  it('goes home with nothing remembered, or without storage', () => {
    expect(takeReturn(memory())).toBe('/')
    expect(takeReturn(null)).toBe('/')
    expect(() => rememberReturn(null, '#/join/K7Q4MD')).not.toThrow()
  })

  it('only takes routes of this app, and not the sign-in pages themselves', () => {
    for (const hash of ['', '#', '#/', 'https://evil.example/', '#//evil.example', '#https://evil.example', '#/login', '#/register', '#/login?x=1']) {
      const s = memory()
      rememberReturn(s, hash)
      expect(takeReturn(s), hash).toBe('/')
    }
  })

  it('ignores a stored value that is not a route of this app', () => {
    const s = memory()
    s.setItem('dartcade:returnTo', '//evil.example')
    expect(takeReturn(s)).toBe('/')
  })
})
