import { describe, it, expect } from 'vitest'
import { verifyCallback, cooldownLeft, showEmailField, rememberCredentials, pendingCredentials, forgetCredentials } from '../verify'

describe('verifyCallback', () => {
  it('returns to the remembered page', () => expect(verifyCallback('/join/K7Q4MD')).toBe('/#/join/K7Q4MD'))
  it('goes to step 2, connecting a board, without one', () => expect(verifyCallback(null)).toBe('/#/settings/boards'))
  it('ignores the home page as a return path', () => expect(verifyCallback('/')).toBe('/#/settings/boards'))
})

describe('cooldownLeft', () => {
  it('is 0 before the first send and after a minute', () => {
    expect(cooldownLeft(null, 1000)).toBe(0)
    expect(cooldownLeft(0, 60_000)).toBe(0)
  })
  it('counts the seconds down, rounding up', () => expect(cooldownLeft(0, 17_500)).toBe(43))
})

describe('showEmailField', () => {
  it('shows the field on the expired-link path, which arrives with no email', () => expect(showEmailField('')).toBe(true))
  it('hides the field once a query email arrived, and stays hidden as the typed value changes', () => {
    // Keyed off the query string, not a typed value: this is the regression a bound `email`
    // state caused (the field unmounted after the first keystroke).
    expect(showEmailField('lena@x.org')).toBe(false)
  })
})

describe('remembered credentials', () => {
  it('are handed out only for the email they were typed for, and until forgotten', () => {
    rememberCredentials('a@x.org', 'secret')
    expect(pendingCredentials('a@x.org')).toEqual({ email: 'a@x.org', password: 'secret' })
    expect(pendingCredentials('b@x.org')).toBeNull()
    forgetCredentials()
    expect(pendingCredentials('a@x.org')).toBeNull()
  })
})
