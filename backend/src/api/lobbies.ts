import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { requireAuth } from '../auth/middleware.js'
import type { LobbyService } from '../lobby/service.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { lobbies: LobbyService }

/**
 * Lobbies and invites. The service throws a LobbyError for anything it refuses; the error
 * handler answers with its status and body (see ApiError). The live state isn't here:
 * every change is pushed on the lobby socket and /ws/me.
 */
export function lobbiesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { lobbies } = opts
  const auth = { preValidation: requireAuth }

  app.post<Route<'createLobby'>>('/api/lobbies', { ...auth, schema: fromSpec('createLobby') }, async (req, reply) =>
    reply.code(201).send(await lobbies.create(req.userId)))

  app.get<Route<'getCurrentLobby'>>('/api/lobbies/current', { ...auth, schema: fromSpec('getCurrentLobby') }, async (req, reply) => {
    const lobby = await lobbies.current(req.userId)
    return lobby ? reply.send(lobby) : reply.code(404).send({ error: 'not in a lobby' })
  })

  app.get<Route<'getLobbyByCode'>>('/api/lobby-codes/:code', { ...auth, schema: fromSpec('getLobbyByCode') }, async (req, reply) => {
    const preview = await lobbies.preview(req.params.code)
    return preview ? reply.send(preview) : reply.code(404).send({ error: 'no open lobby with this code' })
  })

  app.patch<Route<'updateLobby'>>('/api/lobbies/:id', { ...auth, schema: fromSpec('updateLobby') }, async (req, reply) => {
    await lobbies.update(req.userId, req.params.id, req.body)
    return reply.code(204).send()
  })

  app.post<Route<'joinLobby'>>('/api/lobbies/:id/join', { ...auth, schema: fromSpec('joinLobby') }, async (req, reply) =>
    reply.send(await lobbies.join(req.userId, req.params.id, req.body.code)))

  app.post<Route<'leaveLobby'>>('/api/lobbies/:id/leave', { ...auth, schema: fromSpec('leaveLobby') }, async (req, reply) => {
    await lobbies.leave(req.userId, req.params.id)
    return reply.code(204).send()
  })

  app.post<Route<'closeLobby'>>('/api/lobbies/:id/close', { ...auth, schema: fromSpec('closeLobby') }, async (req, reply) => {
    await lobbies.close(req.userId, req.params.id)
    return reply.code(204).send()
  })

  app.post<Route<'addLobbyGuest'>>('/api/lobbies/:id/people', { ...auth, schema: fromSpec('addLobbyGuest') }, async (req, reply) =>
    reply.code(201).send(await lobbies.addGuest(req.userId, req.params.id, req.body)))

  app.patch<Route<'updateLobbyPerson'>>('/api/lobbies/:id/people/:personId', { ...auth, schema: fromSpec('updateLobbyPerson') }, async (req, reply) => {
    await lobbies.updatePerson(req.userId, req.params.id, req.params.personId, req.body)
    return reply.code(204).send()
  })

  app.delete<Route<'removeLobbyPerson'>>('/api/lobbies/:id/people/:personId', { ...auth, schema: fromSpec('removeLobbyPerson') }, async (req, reply) => {
    await lobbies.removePerson(req.userId, req.params.id, req.params.personId)
    return reply.code(204).send()
  })

  app.post<Route<'startLobbyGame'>>('/api/lobbies/:id/start', { ...auth, schema: fromSpec('startLobbyGame') }, async (req, reply) =>
    reply.code(201).send(await lobbies.start(req.userId, req.params.id, req.body.force ?? false)))

  app.post<Route<'rematchLobbyGame'>>('/api/lobbies/:id/rematch', { ...auth, schema: fromSpec('rematchLobbyGame') }, async (req, reply) =>
    reply.code(201).send(await lobbies.rematch(req.userId, req.params.id, req.body.force ?? false)))

  app.post<Route<'inviteToLobby'>>('/api/lobbies/:id/invites', { ...auth, schema: fromSpec('inviteToLobby') }, async (req, reply) =>
    reply.code(201).send(await lobbies.invite(req.userId, req.params.id, req.body.userId)))

  app.get<Route<'listInvites'>>('/api/invites', { ...auth, schema: fromSpec('listInvites') }, async (req) =>
    ({ invites: await lobbies.listInvites(req.userId) }))

  app.post<Route<'acceptInvite'>>('/api/invites/:id/accept', { ...auth, schema: fromSpec('acceptInvite') }, async (req, reply) =>
    reply.send(await lobbies.acceptInvite(req.userId, req.params.id)))

  app.post<Route<'declineInvite'>>('/api/invites/:id/decline', { ...auth, schema: fromSpec('declineInvite') }, async (req, reply) => {
    await lobbies.declineInvite(req.userId, req.params.id)
    return reply.code(204).send()
  })

  done()
}
