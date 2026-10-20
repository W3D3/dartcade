import { describe, it, expect, vi, beforeEach } from 'vitest'
import { viewAs, stopViewingAs } from './impersonate'
import { authClient } from '$lib/auth'

vi.mock('$lib/auth', () => ({
  authClient: { admin: { impersonateUser: vi.fn(), stopImpersonating: vi.fn() } },
}))

const assign = vi.fn()
const reload = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { location: { assign, reload } })
})

describe('viewAs', () => {
  it('starts the session, then loads the app as that account', async () => {
    vi.mocked(authClient.admin.impersonateUser).mockResolvedValue({ data: {}, error: null })
    expect(await viewAs('u2')).toBeNull()
    expect(authClient.admin.impersonateUser).toHaveBeenCalledWith({ userId: 'u2' })
    expect(assign).toHaveBeenCalledWith('/#/')
    expect(reload).toHaveBeenCalled()
  })

  it("returns the server's reason and stays put when it refuses", async () => {
    vi.mocked(authClient.admin.impersonateUser).mockResolvedValue({
      data: null,
      error: { message: 'You cannot impersonate admins' },
    })
    expect(await viewAs('boss')).toEqual({ error: 'You cannot impersonate admins' })
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('stopViewingAs', () => {
  it('ends the session and returns to the users page', async () => {
    vi.mocked(authClient.admin.stopImpersonating).mockResolvedValue({ data: {}, error: null })
    expect(await stopViewingAs()).toBeNull()
    expect(assign).toHaveBeenCalledWith('/#/admin/users')
    expect(reload).toHaveBeenCalled()
  })

  it('returns a failure instead of reloading', async () => {
    vi.mocked(authClient.admin.stopImpersonating).mockResolvedValue({ data: null, error: { message: 'No session' } })
    expect(await stopViewingAs()).toEqual({ error: 'No session' })
    expect(reload).not.toHaveBeenCalled()
  })
})
