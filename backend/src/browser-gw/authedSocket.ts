import type { FastifyRequest } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { WebSocket } from 'ws'
import type { z } from 'zod'
import { getDeviceSession } from '../auth/deviceSession.js'
import { getAuthUser } from '../auth/session.js'
import type { DeviceSession } from '../db/tournamentDevices.js'
import { trackDevice } from '../tournaments/deviceSockets.js'
import { WsCloseCode } from '../schema/game-ws.js'
import { isOpen } from '../util/socket.js'

/**
 * Signs in a browser socket, then hands it to `setup`. Unauthorized: closed. Closed while
 * sign-in was checked: dropped, as no close event will come to remove it again. Whatever
 * `setup` throws closes the socket with an internal error. A venue device's session (tournament
 * mode) is signed in only where `device` opts in; `setup` then gets it as the organizer who paired
 * it plus the session, and must check it against its own tournament. Elsewhere it is Unauthorized.
 */
export function withAuthedSocket(
  connection: SocketStream,
  req: FastifyRequest,
  setup: (socket: WebSocket, userId: string, impersonated: boolean, device: DeviceSession | null) => Promise<void>,
  opts: { device?: boolean } = {},
): void {
  const socket = connection.socket
  getAuthUser(req)
    .then(async user => {
      if (user) return { userId: user.userId, impersonated: user.impersonatedBy !== null, device: null }
      const device = opts.device ? await getDeviceSession(req) : null
      return device ? { userId: device.createdBy, impersonated: false, device } : null
    })
    .then(async who => {
      if (!isOpen(socket)) return
      if (!who) {
        socket.close(WsCloseCode.Unauthorized, 'unauthorized')
        return
      }
      if (who.device) trackDevice(who.device.id, socket)
      await setup(socket, who.userId, who.impersonated, who.device)
    })
    .catch(() => {
      socket.close(WsCloseCode.InternalError, 'internal error')
    })
}

/** The socket's query parsed by `schema`; null (and the socket closed) when it doesn't match. */
export function socketQuery<T extends z.ZodType>(socket: WebSocket, query: unknown, schema: T, missing: string): z.output<T> | null {
  const q = schema.safeParse(query)
  if (q.success) return q.data
  socket.close(WsCloseCode.MissingSession, missing)
  return null
}
