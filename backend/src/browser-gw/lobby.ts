import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { z } from 'zod'
import { withAuthedSocket, socketQuery } from './authedSocket.js'
import { isOpen, onceGone } from '../util/socket.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { LobbyHub } from '../lobby/hub.js'
import type { LobbyService } from '../lobby/service.js'
import type { FriendsService } from '../friends/service.js'

const LobbyQuerySchema = z.object({ lobbyId: z.string().min(1) })

type Opts = FastifyPluginOptions & { lobbies: LobbyService; hub: LobbyHub; friends: FriendsService }

/**
 * The lobby socket (/ws/lobby?lobbyId=…) and the per-user socket (/ws/me). Both only push
 * (schema/lobby-ws-v1.json); changes go through the REST API. An open lobby socket is
 * what makes a member "online" in the lobby; an open /ws/me is what makes a user online for
 * their friends.
 */
export function lobbyGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { lobbies, hub, friends } = opts

  app.get('/ws/lobby', { websocket: true }, (connection: SocketStream, req) => {
    withAuthedSocket(connection, req, async (socket, userId) => {
      const query = socketQuery(socket, req.query, LobbyQuerySchema, 'missing lobbyId')
      if (!query) return
      const { lobbyId } = query
      const access = await lobbies.lobbyAccess(lobbyId, userId)
      if (!isOpen(socket)) return
      if (access === 'not_found') {
        socket.close(WsCloseCode.NotFound, 'lobby not found')
        return
      }
      if (access === 'forbidden') {
        socket.close(WsCloseCode.Forbidden, 'forbidden')
        return
      }

      hub.addLobbySocket(lobbyId, socket, userId)
      onceGone(socket, () => {
        hub.removeLobbySocket(lobbyId, socket)
        lobbies.refreshPresence(lobbyId).catch((err: unknown) => {
          app.log.warn({ lobbyId, err }, 'lobby presence push failed')
        })
      })
      // Everyone, this socket included, gets the lobby with this member online
      await lobbies.refreshPresence(lobbyId)
    })
  })

  app.get('/ws/me', { websocket: true }, (connection: SocketStream, req) => {
    withAuthedSocket(connection, req, async (socket, userId) => {
      const [first, friendsFirst] = await Promise.all([lobbies.meMessage(userId), friends.message(userId)])
      if (!isOpen(socket)) return
      hub.addMeSocket(userId, socket, first, friendsFirst)
      friends.connected(userId)
      onceGone(socket, () => {
        hub.removeMeSocket(userId, socket)
        friends.disconnected(userId)
      })
    })
  })

  done()
}
