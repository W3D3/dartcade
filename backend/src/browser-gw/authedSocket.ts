import type { FastifyRequest } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { WebSocket } from 'ws'
import type { z } from 'zod'
import { getAuthUser } from '../auth/session.js'
import { WsCloseCode } from '../schema/game-ws.js'
import { isOpen } from '../util/socket.js'

/**
 * Signs in a browser socket, then hands it to `setup`. Unauthorized: closed. Closed while
 * sign-in was checked: dropped, as no close event will come to remove it again. Whatever
 * `setup` throws closes the socket with an internal error.
 */
export function withAuthedSocket(
  connection: SocketStream,
  req: FastifyRequest,
  setup: (socket: WebSocket, userId: string) => Promise<void>,
): void {
  const socket = connection.socket
  getAuthUser(req)
    .then(async user => {
      if (!isOpen(socket)) return
      if (!user) {
        socket.close(WsCloseCode.Unauthorized, 'unauthorized')
        return
      }
      await setup(socket, user.userId)
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
