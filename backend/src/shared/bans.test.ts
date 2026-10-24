import { describe, expect, it } from 'vitest'
import { activeBan } from './bans.js'

const now = new Date('2026-10-24T12:00:00Z')

describe('activeBan', () => {
  it('is null for an account that is not banned', () => {
    expect(activeBan({ banned: false, banReason: 'cheating', banExpires: null }, now)).toBeNull()
    expect(activeBan({ banned: null, banReason: null, banExpires: null }, now)).toBeNull()
  })

  it('is the category and no end for a permanent ban', () => {
    expect(activeBan({ banned: true, banReason: 'spamming', banExpires: null }, now)).toEqual({ category: 'spamming', until: null })
  })

  it('holds a timed ban until its expiry, then ends it', () => {
    const until = new Date('2026-10-25T12:00:00Z')
    const ban = { banned: true, banReason: 'trolling', banExpires: until }
    expect(activeBan(ban, now)).toEqual({ category: 'trolling', until })
    expect(activeBan(ban, until)).toBeNull()
  })

  it('reads a reason that is not a category as other', () => {
    expect(activeBan({ banned: true, banReason: 'faked his scores', banExpires: null }, now)?.category).toBe('other')
    expect(activeBan({ banned: true, banReason: 'toString', banExpires: null }, now)?.category).toBe('other')
    expect(activeBan({ banned: true, banReason: null, banExpires: null }, now)?.category).toBe('other')
  })
})
