import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { Kysely } from 'kysely'
import type { WebSocket } from 'ws'
import { z } from 'zod'
import { socketQuery } from './authedSocket.js'
import { getAuthUser } from '../auth/session.js'
import { findOwnBoard } from '../boards/own.js'
import { getBoardByBigScreenTokenHash } from '../db/queries.js'
import type { Database } from '../db/schema.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { WsCloseCode } from '../schema/game-ws.js'
import { hashBoardToken } from '../boards/token.js'
import type { BigScreenService } from '../bigscreen/service.js'
import { isOpen, onceGone } from '../util/socket.js'

const QuerySchema = z.object({ boardId: z.string().min(1) })
const AuthSchema = z.object({ type: z.literal('auth'), token: z.string().min(1) })

export const AUTH_TIMEOUT_MS = 5000

type Opts = FastifyPluginOptions & { db: Kysely<Database>; service: BigScreenService; authTimeoutMs?: number }

function parseAuth(raw: string) {
  try {
    const r = AuthSchema.safeParse(JSON.parse(raw))
    return r.success ? r.data : null
  } catch {
    return null
  }
}

/**
 * The big-screen socket (/ws/board?boardId=…): only pushes (BigScreenMessage). The owner's session
 * cookie opens it; the kiosk has no cookie and sends {type:'auth', token} first, a token that is
 * never accepted in the URL (it would end up in logs).
 */
export function bigScreenGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, service } = opts

  /** The first message the socket sends (null: none within the timeout, or it closed); cancel() stops the timer. */
  const firstMessage = (socket: WebSocket) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const message = new Promise<string | null>(resolve => {
      timer = setTimeout(() => {
        resolve(null)
      }, opts.authTimeoutMs ?? AUTH_TIMEOUT_MS)
      const finish = (v: string | null) => {
        clearTimeout(timer)
        resolve(v)
      }
      socket.once('message', data => {
        finish(Buffer.isBuffer(data) ? data.toString() : '')
      })
      socket.once('close', () => {
        finish(null)
      })
    })
    return {
      message,
      cancel: () => {
        clearTimeout(timer)
      },
    }
  }

  app.get('/ws/board', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket
    const rawQuery = z.record(z.string(), z.unknown()).safeParse(req.query)
    if (rawQuery.success && 'token' in rawQuery.data) {
      socket.close(WsCloseCode.Forbidden, 'token not allowed in the url')
      return
    }
    // Listening from the start: the kiosk's auth message can arrive while the cookie is checked
    const first = firstMessage(socket)
    ;(async () => {
      const query = socketQuery(socket, req.query, QuerySchema, 'missing boardId')
      if (!query) return
      const { boardId } = query
      const user = await getAuthUser(req)
      let ownerId: string
      let viaToken = false
      const own = user ? await findOwnBoard(db, boardId, user.userId) : null
      if (own && 'board' in own) {
        ownerId = own.board.owner_user_id
        first.cancel()
      } else if (own?.problem === 'not_found') {
        socket.close(WsCloseCode.NotFound, 'not_found')
        return
      } else {
        // Not signed in, or signed in as someone else (the kiosk's browser may hold another account): a token decides
        const raw = await first.message
        const msg = raw === null ? null : parseAuth(raw)
        const board = msg && (await getBoardByBigScreenTokenHash(db, hashBoardToken(msg.token)))
        if (!board) {
          socket.close(WsCloseCode.Unauthorized, 'unauthorized')
          return
        }
        if (board.id !== boardId) {
          socket.close(WsCloseCode.Forbidden, 'forbidden')
          return
        }
        ownerId = board.owner_user_id
        viaToken = true
      }
      // The flag is the board owner's, also on the token path
      if (!(await flagEnabled('bigscreen.enabled', await loadFlagUser(db, ownerId)))) {
        socket.close(WsCloseCode.Forbidden, 'forbidden')
        return
      }
      if (!isOpen(socket)) return
      const remove = service.add(
        boardId,
        m => {
          if (isOpen(socket)) socket.send(JSON.stringify(m))
        },
        (code, reason) => {
          socket.close(code, reason)
        },
        viaToken,
      )
      onceGone(socket, remove)
    })().catch((err: unknown) => {
      app.log.warn({ err }, 'big screen socket failed')
      socket.close(WsCloseCode.InternalError, 'internal error')
    })
  })

  done()
}
