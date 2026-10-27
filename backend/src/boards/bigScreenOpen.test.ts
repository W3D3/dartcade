import { describe, it, expect, vi, beforeEach } from 'vitest'

const { send, isOnline } = vi.hoisted(() => ({ send: vi.fn().mockReturnValue(true), isOnline: vi.fn().mockReturnValue(true) }))
vi.mock('../bridge-gw/connections.js', () => ({ bridgeConnections: { send, isOnline } }))
vi.mock('../db/queries.js', () => ({ getBoardById: vi.fn(), claimBigScreenToken: vi.fn().mockResolvedValue(true) }))
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn().mockResolvedValue(true), loadFlagUser: vi.fn().mockResolvedValue(null) }))
import * as queries from '../db/queries.js'
import * as flags from '../flags/index.js'
import { autoOpenBigScreen } from './bigScreenOpen.js'

const board = (mode: 'off' | 'auto' | 'manual') => ({ id: 'b1', owner_user_id: 'u1', big_screen_mode: mode }) as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PUBLIC_URL', 'https://dart.test')
})

describe('autoOpenBigScreen', () => {
  it('opens an auto board', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board('auto'))
    await autoOpenBigScreen({} as any, 'b1', { revoke: vi.fn() }, vi.fn())
    expect(send).toHaveBeenCalledWith('b1', { kind: 'bigscreen.open', data: { url: expect.stringContaining('#/big-screen/b1?k=') } })
  })

  it.each(['off', 'manual'] as const)('leaves a %s board alone', async mode => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board(mode))
    await autoOpenBigScreen({} as any, 'b1', { revoke: vi.fn() }, vi.fn())
    expect(send).not.toHaveBeenCalled()
  })

  it('skips silently when the owner lacks the flag', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board('auto'))
    vi.mocked(flags.flagEnabled).mockResolvedValueOnce(false)
    await autoOpenBigScreen({} as any, 'b1', { revoke: vi.fn() }, vi.fn())
    expect(send).not.toHaveBeenCalled()
    expect(queries.claimBigScreenToken).not.toHaveBeenCalled()
  })
})
