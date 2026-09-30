import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { Ajv } from 'ajv'
import { BrowserConnections } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { getAuthUser } from '../auth/session.js'
import { canAccessSession } from '../api/sessions.js'
import wsSchema from '../schema/game-ws-v1.deref.json' with { type: 'json' }
import { WsCloseCode, type ClientMessage } from '../schema/game-ws.js'
import { checkSnapshot } from '../session/snapshotValidation.js'

export const browserConnections = new BrowserConnections()

// Tolerant reader: newer clients may add fields; the engine only reads the known ones.
// (Ajv's removeAdditional can't be used: it strips fields while trying each oneOf branch.)
function allowExtraFields(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(allowExtraFields)
  if (schema && typeof schema === 'object') {
    return Object.fromEntries(Object.entries(schema).map(([k, v]) =>
      [k, k === 'additionalProperties' && v === false ? true : allowExtraFields(v)]))
  }
  return schema
}
const isClientMessage = new Ajv({ strict: false })
  .compile<ClientMessage>(allowExtraFields(wsSchema.$defs.ClientMessage) as object)

type Opts = FastifyPluginOptions & { engine: SessionEngine }

export async function browserGwPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { engine } = opts

  app.get('/ws', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket

    getAuthUser(req).then(user => {
      if (!user) {
        socket.close(WsCloseCode.Unauthorized, 'unauthorized')
        return
      }

      const sessionId = (req.query as any).sessionId as string | undefined
      if (!sessionId) { socket.close(WsCloseCode.MissingSession, 'missing sessionId'); return }

      const session = engine.getSession(sessionId)
      const snap = engine.getSnapshot(sessionId)
      if (!session || !snap) { socket.close(WsCloseCode.NotFound, 'session not found'); return }
      if (!canAccessSession(user.userId, session)) { socket.close(WsCloseCode.Forbidden, 'forbidden'); return }

      browserConnections.add(sessionId, socket)
      checkSnapshot(snap, msg => app.log.error(msg))
      socket.send(JSON.stringify(snap))

      socket.on('message', async (raw) => {
        let msg: unknown
        try { msg = JSON.parse(raw.toString()) } catch {
          app.log.warn({ sessionId }, 'ignoring non-JSON client message')
          return
        }
        // Invalid messages are dropped, not fatal: a buggy client shouldn't kick a player out
        if (!isClientMessage(msg)) {
          app.log.warn({ sessionId, errors: isClientMessage.errors }, 'ignoring invalid client message')
          return
        }
        await engine.onUserAction(sessionId, msg.action)
      })

      socket.on('close', () => browserConnections.remove(sessionId, socket))
      socket.on('error', () => browserConnections.remove(sessionId, socket))
    }).catch(() => socket.close(WsCloseCode.InternalError, 'internal error'))
  })
}

export function pushSnapshot(sessionId: string, engine: SessionEngine): void {
  const snap = engine.getSnapshot(sessionId)
  if (!snap) return
  checkSnapshot(snap, msg => console.error(msg))
  browserConnections.push(sessionId, snap)
}
