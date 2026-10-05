import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { lobbiesApiPlugin } from './lobbies.js'
import { LobbyError, inLobby } from '../lobby/errors.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'chris'
    done()
  }),
}))

const ref = { id: 'l1', name: "Christoph's lobby", code: 'K7Q4MD' }

function makeApp() {
  const lobbies = {
    create: vi.fn().mockResolvedValue(ref),
    current: vi.fn().mockResolvedValue(null),
    preview: vi.fn().mockResolvedValue(null),
    join: vi.fn().mockResolvedValue(ref),
    leave: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    addGuest: vi.fn().mockResolvedValue({ id: 'p9' }),
    updatePerson: vi.fn().mockResolvedValue(undefined),
    removePerson: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue({ sessionId: 's1' }),
    shuffleTeams: vi.fn().mockResolvedValue(undefined),
    invite: vi.fn().mockResolvedValue({ id: 'i1' }),
    listInvites: vi.fn().mockResolvedValue([]),
    acceptInvite: vi.fn().mockResolvedValue(ref),
    declineInvite: vi.fn().mockResolvedValue(undefined),
  }
  const app = createFastify()
  app.register(lobbiesApiPlugin, { lobbies: lobbies as any })
  return { app, lobbies }
}

beforeEach(() => vi.clearAllMocks())

describe('lobbies API', () => {
  it('creates a lobby', async () => {
    const { app, lobbies } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/lobbies' })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body)).toEqual(ref)
    expect(lobbies.create).toHaveBeenCalledWith('chris')
  })

  it('answers a lobby conflict with its code and details', async () => {
    const { app, lobbies } = makeApp()
    lobbies.create.mockRejectedValueOnce(inLobby('l0'))
    const res = await app.inject({ method: 'POST', url: '/api/lobbies' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: 'leave your current lobby first', code: 'in_lobby', lobbyId: 'l0' })
  })

  it('answers 404 without a current lobby, and the lobby otherwise', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'GET', url: '/api/lobbies/current' })).statusCode).toBe(404)
    lobbies.current.mockResolvedValueOnce(ref)
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/lobbies/current' })).body)).toEqual(ref)
  })

  it('previews a lobby by code', async () => {
    const { app, lobbies } = makeApp()
    lobbies.preview.mockResolvedValueOnce({ id: 'l1', name: 'L', hostName: 'Christoph', peopleCount: 2, boardNames: ['Living room'] })
    const res = await app.inject({ method: 'GET', url: '/api/lobby-codes/k7q4-md' })
    expect(res.statusCode).toBe(200)
    expect(lobbies.preview).toHaveBeenCalledWith('k7q4-md')
  })

  it('changes settings; an empty or invalid change is a 400', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1', payload: { throwOrder: 'random' } })).statusCode).toBe(204)
    expect(lobbies.update).toHaveBeenCalledWith('chris', 'l1', { throwOrder: 'random' })
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1', payload: {} })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1', payload: { throwOrder: 'sideways' } })).statusCode).toBe(400)
  })

  it('joins, leaves and closes', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/join', payload: { code: 'k7q4md' } })).statusCode).toBe(200)
    expect(lobbies.join).toHaveBeenCalledWith('chris', 'l1', 'k7q4md')
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/leave' })).statusCode).toBe(204)
    lobbies.close.mockRejectedValueOnce(LobbyError.forbidden('only the host can do this'))
    const res = await app.inject({ method: 'POST', url: '/api/lobbies/l1/close' })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toEqual({ error: 'only the host can do this' })
  })

  it('joins without a code as a friend of the host', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/join', payload: {} })).statusCode).toBe(200)
    expect(lobbies.join).toHaveBeenCalledWith('chris', 'l1', undefined)
  })

  it('adds, changes and removes people', async () => {
    const { app, lobbies } = makeApp()
    const added = await app.inject({ method: 'POST', url: '/api/lobbies/l1/people', payload: { name: 'Guest 1' } })
    expect(added.statusCode).toBe(201)
    expect(JSON.parse(added.body)).toEqual({ id: 'p9' })
    expect(lobbies.addGuest).toHaveBeenCalledWith('chris', 'l1', { name: 'Guest 1' })
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1/people/p2', payload: { boardId: null } })).statusCode).toBe(204)
    expect(lobbies.updatePerson).toHaveBeenCalledWith('chris', 'l1', 'p2', { boardId: null })
    expect((await app.inject({ method: 'DELETE', url: '/api/lobbies/l1/people/p2' })).statusCode).toBe(204)
    expect(lobbies.removePerson).toHaveBeenCalledWith('chris', 'l1', 'p2')
  })

  it('moves a person to a team and shuffles the teams; an unknown team is a 400', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1/people/p2', payload: { team: 'B' } })).statusCode).toBe(204)
    expect(lobbies.updatePerson).toHaveBeenCalledWith('chris', 'l1', 'p2', { team: 'B' })
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1/people/p2', payload: { team: 'C' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/teams/shuffle' })).statusCode).toBe(204)
    expect(lobbies.shuffleTeams).toHaveBeenCalledWith('chris', 'l1')
    lobbies.shuffleTeams.mockRejectedValueOnce(LobbyError.forbidden('only the host changes teams'))
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/teams/shuffle' })).statusCode).toBe(403)
  })

  it('starts with the soft ready gate: 409 not_ready, then force', async () => {
    const { app, lobbies } = makeApp()
    lobbies.start.mockRejectedValueOnce(
      LobbyError.conflict({ error: 'not everyone is ready', code: 'not_ready', notReady: [{ personId: 'p2', name: 'Lena' }] }),
    )
    const first = await app.inject({ method: 'POST', url: '/api/lobbies/l1/start', payload: {} })
    expect(first.statusCode).toBe(409)
    expect(JSON.parse(first.body)).toMatchObject({ code: 'not_ready', notReady: [{ name: 'Lena' }] })
    expect(lobbies.start).toHaveBeenLastCalledWith('chris', 'l1', false)
    const second = await app.inject({ method: 'POST', url: '/api/lobbies/l1/start', payload: { force: true } })
    expect(second.statusCode).toBe(201)
    expect(JSON.parse(second.body)).toEqual({ sessionId: 's1' })
    expect(lobbies.start).toHaveBeenLastCalledWith('chris', 'l1', true)
  })

  it('invites, lists, accepts and declines', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/invites', payload: { userId: 'max' } })).statusCode).toBe(201)
    expect(lobbies.invite).toHaveBeenCalledWith('chris', 'l1', 'max')
    const invite = {
      id: 'i1',
      lobbyId: 'l1',
      lobbyName: 'L',
      inviterUserId: 'lena',
      inviterName: 'Lena',
      createdAt: new Date(0).toISOString(),
    }
    lobbies.listInvites.mockResolvedValueOnce([invite])
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/invites' })).body)).toEqual({ invites: [invite] })
    expect(JSON.parse((await app.inject({ method: 'POST', url: '/api/invites/i1/accept' })).body)).toEqual(ref)
    expect(lobbies.acceptInvite).toHaveBeenCalledWith('chris', 'i1')
    expect((await app.inject({ method: 'POST', url: '/api/invites/i1/decline' })).statusCode).toBe(204)
    expect(lobbies.declineInvite).toHaveBeenCalledWith('chris', 'i1')
  })
})
