import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { boardSharesApiPlugin } from './boardShares.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'lena'
    done()
  }),
}))
vi.mock('../db/queries.js', () => ({ getBoardById: vi.fn() }))
vi.mock('../db/friends.js', () => ({ areFriends: vi.fn() }))
vi.mock('../db/boardShares.js', () => ({
  insertBoardShareInvite: vi.fn(),
  getBoardShare: vi.fn(),
  acceptBoardShare: vi.fn(),
  deleteBoardShare: vi.fn(),
  granteesOfBoard: vi.fn(),
  incomingSharesFor: vi.fn(),
}))

import { getBoardById } from '../db/queries.js'
import { areFriends } from '../db/friends.js'
import * as shares from '../db/boardShares.js'

const app = () => {
  const a = createFastify()
  a.register(boardSharesApiPlugin, { db: {} as any })
  return a
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/boards/:id/shares', () => {
  it('lists grantees for the owner', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(shares.granteesOfBoard).mockResolvedValue([
      { id: 's1', friendUserId: 'max', friendName: 'Max', status: 'pending', createdAt: new Date('2026-01-01T00:00:00Z') },
    ])
    const res = await app().inject({ method: 'GET', url: '/api/boards/living/shares' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      shares: [{ id: 's1', friendUserId: 'max', friendName: 'Max', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' }],
    })
  })

  it("403s someone else's board", async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'someone-else' } as any)
    const res = await app().inject({ method: 'GET', url: '/api/boards/living/shares' })
    expect(res.statusCode).toBe(403)
  })

  it('404s a board that does not exist', async () => {
    vi.mocked(getBoardById).mockResolvedValue(undefined)
    const res = await app().inject({ method: 'GET', url: '/api/boards/nope/shares' })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/boards/:id/shares', () => {
  it('refuses to share with someone who is not an accepted friend', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(areFriends).mockResolvedValue(false)
    const res = await app().inject({ method: 'POST', url: '/api/boards/living/shares', payload: { friendUserId: 'max' } })
    expect(res.statusCode).toBe(400)
    expect(shares.insertBoardShareInvite).not.toHaveBeenCalled()
  })

  it('invites an accepted friend, returning their real display name', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(areFriends).mockResolvedValue(true)
    vi.mocked(shares.insertBoardShareInvite).mockResolvedValue({
      id: 's1',
      board_id: 'living',
      friend_user_id: 'max',
      status: 'pending',
      created_at: new Date('2026-01-01T00:00:00Z'),
      responded_at: null,
    })
    vi.mocked(shares.granteesOfBoard).mockResolvedValue([
      { id: 's1', friendUserId: 'max', friendName: 'Max', status: 'pending', createdAt: new Date('2026-01-01T00:00:00Z') },
    ])
    const res = await app().inject({ method: 'POST', url: '/api/boards/living/shares', payload: { friendUserId: 'max' } })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body)).toEqual({
      id: 's1',
      friendUserId: 'max',
      friendName: 'Max',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it("403s someone else's board", async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'someone-else' } as any)
    const res = await app().inject({ method: 'POST', url: '/api/boards/living/shares', payload: { friendUserId: 'max' } })
    expect(res.statusCode).toBe(403)
  })

  it('404s a board that does not exist', async () => {
    vi.mocked(getBoardById).mockResolvedValue(undefined)
    const res = await app().inject({ method: 'POST', url: '/api/boards/nope/shares', payload: { friendUserId: 'max' } })
    expect(res.statusCode).toBe(404)
  })

  it('409s a duplicate invite', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(areFriends).mockResolvedValue(true)
    vi.mocked(shares.insertBoardShareInvite).mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }))
    const res = await app().inject({ method: 'POST', url: '/api/boards/living/shares', payload: { friendUserId: 'max' } })
    expect(res.statusCode).toBe(409)
  })
})

describe('DELETE /api/boards/:id/shares/:shareId', () => {
  it('revokes a share for the owner', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1',
      board_id: 'living',
      friend_user_id: 'max',
      status: 'accepted',
      created_at: new Date(),
      responded_at: new Date(),
    })
    vi.mocked(shares.deleteBoardShare).mockResolvedValue(true)
    const res = await app().inject({ method: 'DELETE', url: '/api/boards/living/shares/s1' })
    expect(res.statusCode).toBe(204)
    expect(shares.deleteBoardShare).toHaveBeenCalledWith({}, 's1')
  })

  it("403s someone else's board", async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'someone-else' } as any)
    const res = await app().inject({ method: 'DELETE', url: '/api/boards/living/shares/s1' })
    expect(res.statusCode).toBe(403)
  })

  it('404s a share that belongs to a different board', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1',
      board_id: 'other-board',
      friend_user_id: 'max',
      status: 'accepted',
      created_at: new Date(),
      responded_at: new Date(),
    })
    const res = await app().inject({ method: 'DELETE', url: '/api/boards/living/shares/s1' })
    expect(res.statusCode).toBe(404)
    expect(shares.deleteBoardShare).not.toHaveBeenCalled()
  })

  it('404s a share id that does not exist', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(shares.getBoardShare).mockResolvedValue(undefined)
    const res = await app().inject({ method: 'DELETE', url: '/api/boards/living/shares/s1' })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/board-shares/incoming', () => {
  it('lists invites waiting for the signed-in user', async () => {
    vi.mocked(shares.incomingSharesFor).mockResolvedValue([
      {
        id: 's1',
        boardId: 'living',
        boardName: 'Living room',
        ownerUserId: 'chris',
        ownerName: 'Christoph',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ])
    const res = await app().inject({ method: 'GET', url: '/api/board-shares/incoming' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      shares: [
        {
          id: 's1',
          boardId: 'living',
          boardName: 'Living room',
          ownerUserId: 'chris',
          ownerName: 'Christoph',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    expect(shares.incomingSharesFor).toHaveBeenCalledWith({}, 'lena')
  })
})

describe('POST /api/board-shares/:id/accept', () => {
  it('accepts an invite addressed to you', async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1',
      board_id: 'living',
      friend_user_id: 'lena',
      status: 'pending',
      created_at: new Date(),
      responded_at: null,
    })
    vi.mocked(shares.acceptBoardShare).mockResolvedValue(true)
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/accept' })
    expect(res.statusCode).toBe(204)
    expect(shares.acceptBoardShare).toHaveBeenCalledWith({}, 's1', expect.any(Date))
  })

  it("404s an invite addressed to someone else", async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1',
      board_id: 'living',
      friend_user_id: 'max',
      status: 'pending',
      created_at: new Date(),
      responded_at: null,
    })
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/accept' })
    expect(res.statusCode).toBe(404)
    expect(shares.acceptBoardShare).not.toHaveBeenCalled()
  })

  it('accepting twice 404s the second time', async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1',
      board_id: 'living',
      friend_user_id: 'lena',
      status: 'accepted',
      created_at: new Date(),
      responded_at: new Date(),
    })
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/accept' })
    expect(res.statusCode).toBe(404)
    expect(shares.acceptBoardShare).not.toHaveBeenCalled()
  })

  it('404s an invite that does not exist', async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue(undefined)
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/accept' })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/board-shares/:id/decline', () => {
  it('declines an invite addressed to you', async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1',
      board_id: 'living',
      friend_user_id: 'lena',
      status: 'pending',
      created_at: new Date(),
      responded_at: null,
    })
    vi.mocked(shares.deleteBoardShare).mockResolvedValue(true)
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/decline' })
    expect(res.statusCode).toBe(204)
    expect(shares.deleteBoardShare).toHaveBeenCalledWith({}, 's1')
  })

  it('declining twice 404s the second time', async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1',
      board_id: 'living',
      friend_user_id: 'lena',
      status: 'accepted',
      created_at: new Date(),
      responded_at: new Date(),
    })
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/decline' })
    expect(res.statusCode).toBe(404)
    expect(shares.deleteBoardShare).not.toHaveBeenCalled()
  })

  it("404s an invite addressed to someone else", async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1',
      board_id: 'living',
      friend_user_id: 'max',
      status: 'pending',
      created_at: new Date(),
      responded_at: null,
    })
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/decline' })
    expect(res.statusCode).toBe(404)
  })
})
