import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import PasskeysCard from '../components/settings/PasskeysCard.svelte'
import { passkeyFailure, passkeyListSchema, passkeyLastUsed, passkeyName } from '../passkeys.js'
import { canConfirmWithPasskey } from '../deleteAccount.js'

describe('passkey wording', () => {
  const now = new Date(2026, 10, 8, 12)

  it('says when a passkey was last used', () => {
    expect(passkeyLastUsed(null, now)).toBe('Never used')
    expect(passkeyLastUsed(new Date(2026, 10, 8, 1), now)).toBe('Used today')
    expect(passkeyLastUsed(new Date(2026, 10, 7, 23), now)).toBe('Used yesterday')
    expect(passkeyLastUsed(new Date(2026, 10, 4), now)).toBe('Used 4 days ago')
    expect(passkeyLastUsed(new Date(2026, 9, 1), now)).toBe('Used 1 Oct 2026')
  })

  it('names an unnamed passkey', () => {
    expect(passkeyName({ name: 'Work laptop' })).toBe('Work laptop')
    expect(passkeyName({ name: '  ' })).toBe('Passkey')
    expect(passkeyName({ name: null })).toBe('Passkey')
  })

  it('tells a cancelled prompt, a stale session and a refusal apart', () => {
    expect(passkeyFailure({ code: 'AUTH_CANCELLED', message: 'cancelled' }, 'x')).toEqual({ kind: 'cancelled' })
    expect(passkeyFailure({ code: 'SESSION_NOT_FRESH' }, 'x')).toEqual({ kind: 'stale' })
    expect(passkeyFailure({ code: 'EMAIL_NOT_VERIFIED' }, 'x')).toEqual({ kind: 'error', text: 'Verify your email address first.' })
    expect(passkeyFailure({ message: 'Nope' }, 'x')).toEqual({ kind: 'error', text: 'Nope' })
    expect(passkeyFailure({}, 'Could not add the passkey')).toEqual({ kind: 'error', text: 'Could not add the passkey' })
  })
})

describe('passkeyListSchema', () => {
  it("reads better-auth's rows, with or without a last-used time", () => {
    const rows = passkeyListSchema.parse([
      { id: 'a', name: 'Laptop', createdAt: new Date(2026, 10, 1), lastUsedAt: '2026-11-02T10:00:00.000Z' },
      { id: 'b', createdAt: '2026-11-01T10:00:00.000Z' },
    ])
    expect(rows[0].lastUsedAt).toBeInstanceOf(Date)
    expect(rows[1]).toMatchObject({ name: null, lastUsedAt: null })
    expect(passkeyListSchema.safeParse({ error: 'x' }).success).toBe(false)
  })
})

describe('PasskeysCard', () => {
  it('has its title, and says so when the browser has no passkeys', () => {
    const out = render(PasskeysCard).body
    expect(out).toContain('Passkeys')
    expect(out).toContain('This browser does not support passkeys.')
  })
})

describe('canConfirmWithPasskey', () => {
  it('needs only the exact name', () => {
    expect(canConfirmWithPasskey('Lena', 'Lena')).toBe(true)
    expect(canConfirmWithPasskey(' Lena ', 'Lena')).toBe(true)
    expect(canConfirmWithPasskey('lena', 'Lena')).toBe(false)
    expect(canConfirmWithPasskey('', 'Lena')).toBe(false)
  })
})
