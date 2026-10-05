import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'crypto'

vi.mock('../db/queries.js', () => ({
  getBoardById: vi.fn((_db: unknown, id: string) =>
    Promise.resolve(id === 'living' ? { id: 'living', owner_user_id: 'chris', name: 'Living room' } : undefined),
  ),
}))
import { findOwnBoard } from './own.js'
import { hashBoardToken, newBoardToken } from './token.js'

describe('findOwnBoard', () => {
  it("finds the user's own board, and says why not otherwise", async () => {
    expect(await findOwnBoard({} as any, 'living', 'chris')).toEqual({ board: expect.objectContaining({ id: 'living' }) })
    expect(await findOwnBoard({} as any, 'living', 'lena')).toEqual({ problem: 'not_owner' })
    expect(await findOwnBoard({} as any, 'gone', 'chris')).toEqual({ problem: 'not_found' })
  })
})

describe('board tokens', () => {
  it('hashes a token as hex SHA-256', () => {
    expect(hashBoardToken('dev-bridge-token')).toBe(createHash('sha256').update('dev-bridge-token').digest('hex'))
  })

  it('makes a fresh 32-byte token with its hash', () => {
    const a = newBoardToken()
    const b = newBoardToken()
    expect(a.token).toMatch(/^[0-9a-f]{64}$/)
    expect(a.tokenHash).toBe(hashBoardToken(a.token))
    expect(b.token).not.toBe(a.token)
  })
})
