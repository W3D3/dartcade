import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/index.js', () => ({ db: {} }))
vi.mock('./session.js', () => ({ getAuthUser: vi.fn() }))
vi.mock('../db/users.js', () => ({ getRoleAndEmail: vi.fn() }))

const { isAdmin, requireAdmin } = await import('./admin.js')
const { getRoleAndEmail } = await import('../db/users.js')

beforeEach(() => vi.clearAllMocks())

describe('isAdmin', () => {
  it('trusts the admin role', () => expect(isAdmin({ role: 'admin', email: 'a@x' }, [])).toBe(true))
  it('trusts ADMIN_EMAILS, ignoring case', () => expect(isAdmin({ role: null, email: 'Boss@X.org' }, ['boss@x.org'])).toBe(true))
  it('refuses everyone else', () => expect(isAdmin({ role: 'user', email: 'a@x' }, ['b@x'])).toBe(false))
})

function run(req: any, reply: any): Promise<void> {
  return new Promise(resolve => {
    reply.send.mockImplementation(() => {
      resolve()
      return reply
    })
    requireAdmin(req, reply, () => resolve())
  })
}

describe('requireAdmin', () => {
  it('lets an admin through', async () => {
    vi.mocked(getRoleAndEmail).mockResolvedValue({ role: 'admin', email: 'a@x' })
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() } as any
    await run({ userId: 'u1' }, reply)
    expect(reply.code).not.toHaveBeenCalled()
  })
  it('answers 403 for anyone else', async () => {
    vi.mocked(getRoleAndEmail).mockResolvedValue({ role: null, email: 'a@x' })
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as any
    await run({ userId: 'u1' }, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith({ error: 'forbidden' })
  })
})
