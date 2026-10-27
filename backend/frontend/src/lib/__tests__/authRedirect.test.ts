import { describe, it, expect } from 'vitest'
import { authRedirect, socialError } from '../authRedirect.js'

describe('authRedirect', () => {
  it('sends a verify-email error to #/verify, dropping the page query', () => {
    expect(authRedirect('?error=TOKEN_EXPIRED', '#/settings/boards')).toEqual({
      hash: '#/verify?error=TOKEN_EXPIRED',
      stripQuery: true,
    })
    expect(authRedirect('?error=INVALID_USER', '#/join/K7Q4MD')).toEqual({
      hash: '#/verify?error=INVALID_USER',
      stripQuery: true,
    })
  })

  it('leaves a reset-password error or token alone for #/reset to handle', () => {
    expect(authRedirect('?error=INVALID_TOKEN', '#/reset')).toEqual({ hash: '#/reset', stripQuery: false })
    expect(authRedirect('?token=abc123', '#/reset')).toEqual({ hash: '#/reset', stripQuery: false })
  })

  it('carries a failed Sign in with Discord into #/login, where the page can read it', () => {
    expect(authRedirect('?error=account_not_linked', '#/login')).toEqual({ hash: '#/login?error=account_not_linked', stripQuery: true })
    expect(socialError('account_not_linked')).toContain('Sign in with your email and password')
    expect(socialError('something_else')).toBe('Couldn’t sign in with Discord. Try again.')
  })

  it('leaves everything alone with no error', () => {
    expect(authRedirect('', '#/settings/boards')).toEqual({ hash: '#/settings/boards', stripQuery: false })
    expect(authRedirect('?board=b1', '#/')).toEqual({ hash: '#/', stripQuery: false })
  })

  it('ignores an error code it does not recognize', () => {
    expect(authRedirect('?error=SOME_OTHER_CODE', '#/settings/boards')).toEqual({
      hash: '#/settings/boards',
      stripQuery: false,
    })
  })
})
