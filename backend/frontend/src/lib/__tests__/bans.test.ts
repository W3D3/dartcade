import { describe, it, expect } from 'vitest'
import { banEnd, banFromSignIn, banLine } from '../bans'

describe('banLine', () => {
  it("is the category's public line for a permanent ban", () => {
    expect(banLine({ category: 'harassment', until: null })).toBe('Closed for abusive behaviour')
  })

  it('adds the day a timed ban ends', () => {
    expect(banLine({ category: 'cheating', until: '2026-11-01T12:00:00.000Z' })).toBe('Closed for cheating until 1 Nov 2026')
  })
})

describe('banFromSignIn', () => {
  it("reads the ban from a banned sign-in's error", () => {
    const err = {
      code: 'BANNED_USER',
      message: 'Closed for spamming',
      category: 'spamming',
      until: '2026-11-01T00:00:00.000Z',
      status: 403,
    }
    expect(banFromSignIn(err)).toEqual({ category: 'spamming', until: '2026-11-01T00:00:00.000Z' })
  })

  it('reads an end the client already parsed into a Date', () => {
    const err = { code: 'BANNED_USER', category: 'cheating', until: new Date('2026-11-01T00:00:00.000Z') }
    expect(banFromSignIn(err)).toEqual({ category: 'cheating', until: '2026-11-01T00:00:00.000Z' })
  })

  it('falls back to a permanent fair-play ban when the details are missing', () => {
    expect(banFromSignIn({ code: 'BANNED_USER', message: 'You have been banned' })).toEqual({ category: 'other', until: null })
  })

  it('is null for any other error', () => {
    expect(banFromSignIn({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid' })).toBeNull()
    expect(banFromSignIn(null)).toBeNull()
  })
})

describe('banEnd', () => {
  const now = new Date('2026-10-24T12:00:00.000Z')

  it('counts a set length in days from now', () => {
    expect(banEnd('1', '', now)).toEqual({ until: '2026-10-25T12:00:00.000Z' })
    expect(banEnd('30', '', now)).toEqual({ until: '2026-11-23T12:00:00.000Z' })
  })

  it('has no end for a permanent ban', () => {
    expect(banEnd('permanent', '2026-12-01', now)).toEqual({ until: null })
  })

  it('ends a custom ban at the start of the picked day, local time', () => {
    expect(banEnd('custom', '2026-12-01', now)).toEqual({ until: new Date(2026, 11, 1).toISOString() })
  })

  it('refuses a custom ban without a day, or one that is not in the future', () => {
    expect(banEnd('custom', '', now)).toEqual({ error: 'Pick the day the ban ends.' })
    expect(banEnd('custom', '2026-10-01', now)).toEqual({ error: 'The ban must end in the future.' })
  })
})
