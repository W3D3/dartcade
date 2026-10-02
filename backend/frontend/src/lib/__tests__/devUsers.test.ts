import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: string[] = []
vi.mock('../auth.js', () => ({
  authClient: {
    signOut: vi.fn(() => { calls.push('signOut'); return Promise.resolve({}) }),
    signIn: { email: vi.fn((c: { email: string }) => { calls.push(`signIn ${c.email}`); return Promise.resolve({ error: null }) }) },
  },
  currentUser: { refresh: vi.fn(() => { calls.push('refresh user'); return Promise.resolve() }) },
}))
vi.mock('../activeSession.js', () => ({
  activeSessionId: { refresh: vi.fn(() => { calls.push('refresh game'); return Promise.resolve() }) },
}))

const { DEV_USERS, signInAs } = await import('../devUsers.js')

describe('dev users', () => {
  const win = { location: { hash: '#/login' } }
  beforeEach(() => { calls.length = 0; vi.stubGlobal('window', win) })

  it('lists Admin and the darters, each with a distinct email', () => {
    expect(DEV_USERS.map(u => u.name)).toEqual(['Admin', 'Luke', 'Phil', 'Michael', 'Gerwyn'])
    expect(new Set(DEV_USERS.map(u => u.email)).size).toBe(DEV_USERS.length)
  })

  it('switches user: signs out, signs in as them, reloads who is signed in, goes home', async () => {
    const luke = DEV_USERS[1]
    expect(await signInAs(luke)).toBeNull()
    expect(calls).toEqual(['signOut', 'signIn luke@dartcade.local', 'refresh user', 'refresh game'])
    expect(win.location.hash).toBe('#/')
  })
})
