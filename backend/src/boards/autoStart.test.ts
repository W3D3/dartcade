import { describe, it, expect, vi, beforeEach } from 'vitest'

const { request, isOnline } = vi.hoisted(() => ({ request: vi.fn(), isOnline: vi.fn().mockReturnValue(true) }))
vi.mock('../bridge-gw/connections.js', () => ({ bridgeConnections: { request, isOnline } }))
vi.mock('../db/queries.js', () => ({ getBoardById: vi.fn() }))
import * as queries from '../db/queries.js'
import { autoStartBoards } from './autoStart.js'

const board = (auto_start: boolean) => ({ id: 'b1', auto_start }) as any
const state = (status: string) => request.mockResolvedValueOnce({ status: 200, state: { status, running: false, event: null } })

beforeEach(() => {
  vi.clearAllMocks()
  request.mockResolvedValue({ status: 200 })
})

describe('autoStartBoards', () => {
  it('starts a stopped board once', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board(true))
    state('Stopped')
    await autoStartBoards({} as any, ['b1', 'b1'], vi.fn())
    expect(request.mock.calls.map(c => c[1].op)).toEqual(['state', 'start'])
  })

  it('leaves a running board alone', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board(true))
    state('Throw')
    await autoStartBoards({} as any, ['b1'], vi.fn())
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the board has it turned off', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board(false))
    await autoStartBoards({} as any, ['b1'], vi.fn())
    expect(request).not.toHaveBeenCalled()
  })

  it('logs instead of throwing when the start fails', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board(true))
    state('Stopped')
    request.mockRejectedValueOnce(new Error('boom'))
    const warn = vi.fn()
    await autoStartBoards({} as any, ['b1'], warn)
    expect(warn).toHaveBeenCalled()
  })
})
