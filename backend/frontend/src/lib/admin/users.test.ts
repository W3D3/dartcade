import { describe, it, expect } from 'vitest'
import {
  createUserSearch,
  joinedDate,
  lastLoginText,
  compareLastLogin,
  loadColumnVisibility,
  saveColumnVisibility,
  type AdminUser,
} from './users'

function user(id: string): AdminUser {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    emailVerified: false,
    role: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
  }
}

describe('joinedDate', () => {
  it('formats as day month year', () => {
    expect(joinedDate('2026-01-05T00:00:00.000Z')).toBe('5 Jan 2026')
  })

  it('is blank for a date that does not parse', () => {
    expect(joinedDate('not a date')).toBe('')
  })
})

describe('createUserSearch', () => {
  it("keeps the latest query's result even when an older request resolves after it", async () => {
    const pending = new Map<string, (users: AdminUser[] | null) => void>()
    const fetch = (q: string) =>
      new Promise<AdminUser[] | null>(resolve => {
        pending.set(q, resolve)
      })
    const results: (AdminUser[] | null)[] = []
    const search = createUserSearch(r => results.push(r), fetch)

    search.search('a')
    search.search('b')
    // The newer request ('b') answers first; the older, slower one ('a') answers late.
    pending.get('b')?.([user('bee')])
    pending.get('a')?.([user('ay')])
    await Promise.resolve()
    await Promise.resolve()

    expect(results).toEqual([[user('bee')]])
  })

  it('applies every result when requests resolve in order', async () => {
    const results: (AdminUser[] | null)[] = []
    const search = createUserSearch(
      r => results.push(r),
      q => Promise.resolve(q ? [user(q)] : []),
    )

    search.search('a')
    await Promise.resolve()
    search.search('b')
    await Promise.resolve()

    expect(results).toEqual([[user('a')], [user('b')]])
  })
})

describe('lastLoginText', () => {
  it('formats a real last login like the joined column', () => {
    expect(lastLoginText('2026-01-05T00:00:00.000Z')).toBe('5 Jan 2026')
  })

  it('is an em dash for a user who never logged in', () => {
    expect(lastLoginText(null)).toBe('—')
  })
})

describe('compareLastLogin', () => {
  it('sorts real timestamps ascending', () => {
    expect(compareLastLogin('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')).toBeLessThan(0)
    expect(compareLastLogin('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBeGreaterThan(0)
  })

  it('always sorts a null (never logged in) after a real timestamp', () => {
    expect(compareLastLogin(null, '2026-01-01T00:00:00.000Z')).toBeGreaterThan(0)
    expect(compareLastLogin('2026-01-01T00:00:00.000Z', null)).toBeLessThan(0)
  })

  it('treats two nulls as equal', () => {
    expect(compareLastLogin(null, null)).toBe(0)
  })
})

describe('loadColumnVisibility', () => {
  const store = (value: string | null) => ({ getItem: () => value })

  it('is {} without storage or a stored value', () => {
    expect(loadColumnVisibility(null)).toEqual({})
    expect(loadColumnVisibility(store(null))).toEqual({})
  })

  it('returns the stored visibility', () => {
    expect(loadColumnVisibility(store(JSON.stringify({ verified: false, email: true })))).toEqual({ verified: false, email: true })
  })

  it('ignores a value that is not a column-id-to-boolean map', () => {
    expect(loadColumnVisibility(store('not json'))).toEqual({})
    expect(loadColumnVisibility(store(JSON.stringify(['verified'])))).toEqual({})
    expect(loadColumnVisibility(store(JSON.stringify({ verified: 'no' })))).toEqual({})
  })
})

describe('saveColumnVisibility', () => {
  it('stores the visibility as JSON', () => {
    const data = new Map<string, string>()
    const store = { setItem: (k: string, v: string) => data.set(k, v) }
    saveColumnVisibility(store, { verified: false })
    expect(JSON.parse([...data.values()][0])).toEqual({ verified: false })
  })

  it('does not throw when storage is unavailable or blocked', () => {
    expect(() => saveColumnVisibility(null, { verified: false })).not.toThrow()
    const throwing = {
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => saveColumnVisibility(throwing, { verified: false })).not.toThrow()
  })
})
