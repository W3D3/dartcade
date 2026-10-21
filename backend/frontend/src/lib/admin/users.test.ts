import { describe, it, expect } from 'vitest'
import {
  createUserSearch,
  joinedDate,
  lastLoginText,
  compareLastLogin,
  loadColumnVisibility,
  saveColumnVisibility,
  roleActions,
  roleChange,
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

describe('roleActions', () => {
  it('offers every role the account does not have', () => {
    expect(roleActions(null).map(a => a.label)).toEqual(['Make admin', 'Make moderator'])
    expect(roleActions('moderator').map(a => a.label)).toEqual(['Make admin', 'Remove role'])
    expect(roleActions('admin').map(a => a.label)).toEqual(['Make moderator', 'Demote'])
  })
})

describe('roleChange', () => {
  const ann = { name: 'Ann' }
  it('says what an admin may do', () => {
    expect(roleChange({ ...ann, role: null }, 'admin', false)).toMatchObject({ title: 'Make admin?', danger: false })
  })

  it('a moderator may only look at and invalidate games', () => {
    const c = roleChange({ ...ann, role: null }, 'moderator', false)
    expect(c).toMatchObject({ title: 'Make moderator?', confirm: 'Make moderator', danger: false })
    expect(c.body).toContain('invalidate')
  })

  it('warns when making an admin a moderator takes admin away, and you lose the pages if it is you', () => {
    const other = roleChange({ ...ann, role: 'admin' }, 'moderator', false)
    expect(other).toMatchObject({ danger: true })
    expect(other.body).toContain('lose their admin access')
    expect(other.body).not.toContain("You'll lose")
    expect(roleChange({ ...ann, role: 'admin' }, 'moderator', true).body).toContain("You'll lose access to the admin pages")
  })

  it('removing a role names the one being removed', () => {
    expect(roleChange({ ...ann, role: 'admin' }, null, true)).toMatchObject({
      title: 'Remove admin access?',
      confirm: 'Demote',
      danger: true,
    })
    expect(roleChange({ ...ann, role: 'admin' }, null, true).body).toContain("You'll lose access")
    expect(roleChange({ ...ann, role: 'moderator' }, null, false)).toMatchObject({ title: 'Remove moderator access?', confirm: 'Remove' })
  })
})
