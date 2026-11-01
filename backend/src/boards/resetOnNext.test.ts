import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/queries.js', () => ({ getBoardById: vi.fn() }))
vi.mock('./bmState.js', () => ({ askBoard: vi.fn(), BM_TIMEOUT_MS: 1 }))

import { getBoardById } from '../db/queries.js'
import { askBoard } from './bmState.js'
import { resetBoardOnNext } from './resetOnNext.js'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const board = (reset_on_next: boolean) => ({ id: 'b1', reset_on_next }) as any

describe('resetBoardOnNext', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resets a board that has it on', async () => {
    vi.mocked(getBoardById).mockResolvedValue(board(true))
    vi.mocked(askBoard).mockResolvedValue({ ok: true, res: { status: 200 } } as any)
    resetBoardOnNext({} as any, 'b1', () => true, vi.fn())
    await flush()
    expect(askBoard).toHaveBeenCalledWith('b1', { op: 'reset' }, expect.any(Number))
  })

  it('leaves a board that has it off', async () => {
    vi.mocked(getBoardById).mockResolvedValue(board(false))
    resetBoardOnNext({} as any, 'b1', () => true, vi.fn())
    await flush()
    expect(askBoard).not.toHaveBeenCalled()
  })

  it('leaves the board once a dart of the next visit has arrived', async () => {
    vi.mocked(getBoardById).mockResolvedValue(board(true))
    resetBoardOnNext({} as any, 'b1', () => false, vi.fn())
    await flush()
    expect(askBoard).not.toHaveBeenCalled()
  })

  it('warns when the reset fails', async () => {
    vi.mocked(getBoardById).mockResolvedValue(board(true))
    vi.mocked(askBoard).mockResolvedValue({ ok: false, code: 503, error: 'board offline' })
    const warn = vi.fn()
    resetBoardOnNext({} as any, 'b1', () => true, warn)
    await flush()
    expect(warn).toHaveBeenCalled()
  })
})
