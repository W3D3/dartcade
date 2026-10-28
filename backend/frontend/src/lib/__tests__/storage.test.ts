import { afterEach, describe, it, expect, vi } from 'vitest'
import { deviceStore, readFlag, writeFlag } from '../storage'

function memoryStore(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: k => void m.delete(k),
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('device storage', () => {
  it('remembers a flag, and gives the fallback until it is set', () => {
    vi.stubGlobal('localStorage', memoryStore())
    expect(readFlag('k', true)).toBe(true)
    writeFlag('k', false)
    expect(readFlag('k', true)).toBe(false)
    writeFlag('k', true)
    expect(readFlag('k')).toBe(true)
  })

  it('is null, and flags fall back, where reading localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    try {
      expect(deviceStore()).toBeNull()
      expect(readFlag('k', true)).toBe(true)
      expect(() => writeFlag('k', true)).not.toThrow()
    } finally {
      delete (globalThis as { localStorage?: Storage }).localStorage
    }
  })
})
