import { describe, it, expect, vi } from 'vitest'
import { findAccessibleBoard } from './own.js'

vi.mock('../db/queries.js', () => ({ getBoardById: vi.fn() }))
vi.mock('../db/boardShares.js', () => ({ hasAcceptedBoardShare: vi.fn() }))
import { getBoardById } from '../db/queries.js'
import { hasAcceptedBoardShare } from '../db/boardShares.js'

describe('findAccessibleBoard', () => {
  it('finds it for the owner without checking shares', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'b', owner_user_id: 'chris' } as any)
    const r = await findAccessibleBoard({} as any, 'b', 'chris')
    expect(r).toEqual({ board: { id: 'b', owner_user_id: 'chris' } })
    expect(hasAcceptedBoardShare).not.toHaveBeenCalled()
  })

  it('finds it for an accepted grantee, refuses everyone else', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'b', owner_user_id: 'chris' } as any)
    vi.mocked(hasAcceptedBoardShare).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await findAccessibleBoard({} as any, 'b', 'lena')).toEqual({ board: { id: 'b', owner_user_id: 'chris' } })
    expect(await findAccessibleBoard({} as any, 'b', 'max')).toEqual({ problem: 'not_owner' })
  })

  it('not_found when the board does not exist', async () => {
    vi.mocked(getBoardById).mockResolvedValue(undefined)
    expect(await findAccessibleBoard({} as any, 'nope', 'chris')).toEqual({ problem: 'not_found' })
  })
})
