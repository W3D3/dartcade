import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { WsCloseCode } from '../schema/game-ws.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn() }))
import { getAuthUser } from '../auth/session.js'
import { socketQuery, withAuthedSocket } from './authedSocket.js'

const fakeSocket = (readyState = 1) => ({ OPEN: 1, readyState, close: vi.fn() })
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  vi.mocked(getAuthUser).mockReset()
})

describe('withAuthedSocket', () => {
  it('hands a signed-in socket and its user to setup', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'chris' })
    const socket = fakeSocket()
    const setup = vi.fn().mockResolvedValue(undefined)
    withAuthedSocket({ socket } as any, {} as any, setup)
    await flush()
    expect(setup).toHaveBeenCalledWith(socket, 'chris')
    expect(socket.close).not.toHaveBeenCalled()
  })

  it('closes the socket of the signed out', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null)
    const socket = fakeSocket()
    const setup = vi.fn()
    withAuthedSocket({ socket } as any, {} as any, setup)
    await flush()
    expect(socket.close).toHaveBeenCalledWith(WsCloseCode.Unauthorized, 'unauthorized')
    expect(setup).not.toHaveBeenCalled()
  })

  it('drops a socket that closed while sign-in was checked', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'chris' })
    const socket = fakeSocket(3)
    const setup = vi.fn()
    withAuthedSocket({ socket } as any, {} as any, setup)
    await flush()
    expect(setup).not.toHaveBeenCalled()
    expect(socket.close).not.toHaveBeenCalled()
  })

  it('closes with an internal error when sign-in or setup fails', async () => {
    vi.mocked(getAuthUser).mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ userId: 'chris' })
    const first = fakeSocket()
    withAuthedSocket({ socket: first } as any, {} as any, vi.fn())
    const second = fakeSocket()
    withAuthedSocket({ socket: second } as any, {} as any, vi.fn().mockRejectedValue(new Error('boom')))
    await flush()
    expect(first.close).toHaveBeenCalledWith(WsCloseCode.InternalError, 'internal error')
    expect(second.close).toHaveBeenCalledWith(WsCloseCode.InternalError, 'internal error')
  })
})

describe('socketQuery', () => {
  const Schema = z.object({ lobbyId: z.string().min(1) })

  it('returns the parsed query', () => {
    const socket = fakeSocket()
    expect(socketQuery(socket as any, { lobbyId: 'l1', extra: 'x' }, Schema, 'missing lobbyId')).toEqual({ lobbyId: 'l1' })
    expect(socket.close).not.toHaveBeenCalled()
  })

  it('closes the socket when the query does not match', () => {
    const socket = fakeSocket()
    expect(socketQuery(socket as any, {}, Schema, 'missing lobbyId')).toBeNull()
    expect(socket.close).toHaveBeenCalledWith(WsCloseCode.MissingSession, 'missing lobbyId')
  })
})
