import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./session.js', () => ({ getAuthUser: vi.fn() }))

const { requireAuth } = await import('./middleware.js')
const { getAuthUser } = await import('./session.js')

beforeEach(() => vi.clearAllMocks())

describe('requireAuth', () => {
  it('sets req.userId when session is valid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'user-123' })
    const req = { headers: {} } as any
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() } as any
    await requireAuth(req, reply)
    expect(req.userId).toBe('user-123')
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('returns 401 and does not set userId when no session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)
    const req = { headers: {} } as any
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as any
    await requireAuth(req, reply)
    expect(reply.code).toHaveBeenCalledWith(401)
    expect(reply.send).toHaveBeenCalledWith({ error: 'unauthorized' })
    expect(req.userId).toBeUndefined()
  })
})
