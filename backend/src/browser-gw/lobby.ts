import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { z } from 'zod'
import { getAuthUser } from '../auth/session.js'
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
    const socket = connection.socket
    getAuthUser(req)
      .then(async user => {
        // Closed while sign-in was checked: no close event will come to remove it again
        if (socket.readyState !== socket.OPEN) return
        if (!user) {
          socket.close(WsCloseCode.Unauthorized, 'unauthorized')
          return
        }
        const q = LobbyQuerySchema.safeParse(req.query)
        if (!q.success) {
          socket.close(WsCloseCode.MissingSession, 'missing lobbyId')
          return
        }
        const { lobbyId } = q.data
        const access = await lobbies.lobbyAccess(lobbyId, user.userId)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- readyState can change across the await, though TS doesn't see it
        if (socket.readyState !== socket.OPEN) return
        if (access === 'not_found') {
          socket.close(WsCloseCode.NotFound, 'lobby not found')
          return
        }
        if (access === 'forbidden') {
          socket.close(WsCloseCode.Forbidden, 'forbidden')
          return
        }

        hub.addLobbySocket(lobbyId, socket, user.userId)
        // 'error' is followed by 'close': handle whichever comes first, once
        let gone = false
        const onGone = () => {
          if (gone) return
          gone = true
          hub.removeLobbySocket(lobbyId, socket)
          lobbies.refreshPresence(lobbyId).catch((err: unknown) => {
            app.log.warn({ lobbyId, err }, 'lobby presence push failed')
          })
        }
        socket.on('close', onGone)
        socket.on('error', onGone)
        // Everyone, this socket included, gets the lobby with this member online
        await lobbies.refreshPresence(lobbyId)
      })
      .catch(() => {
        socket.close(WsCloseCode.InternalError, 'internal error')
      })
  })

  app.get('/ws/me', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket
    getAuthUser(req)
      .then(async user => {
        if (socket.readyState !== socket.OPEN) return
        if (!user) {
          socket.close(WsCloseCode.Unauthorized, 'unauthorized')
          return
        }
        const [first, friendsFirst] = await Promise.all([lobbies.meMessage(user.userId), friends.message(user.userId)])
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- readyState can change across the await, though TS doesn't see it
        if (socket.readyState !== socket.OPEN) return
        hub.addMeSocket(user.userId, socket, first, friendsFirst)
        friends.connected(user.userId)
        let gone = false
        const onGone = () => {
          if (gone) return
          gone = true
          hub.removeMeSocket(user.userId, socket)
          friends.disconnected(user.userId)
        }
        socket.on('close', onGone)
        socket.on('error', onGone)
      })
      .catch(() => {
        socket.close(WsCloseCode.InternalError, 'internal error')
      })
  })

  done()
}
