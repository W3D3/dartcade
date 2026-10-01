import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { RawData } from 'ws'
import { z } from 'zod'
import { BrowserConnections } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { getAuthUser } from '../auth/session.js'
import { canAccessSession } from '../api/sessions.js'
import { WsCloseCode } from '../schema/game-ws.js'
import { ClientMessageSchema } from '../schema/zod.js'
import { checkSnapshot } from '../session/snapshotValidation.js'

export const browserConnections = new BrowserConnections()

// Tolerant reader: the zod schema (generated from schema/game-ws-v1.json) strips fields a
// newer or buggy client adds, at every level, before the action reaches the engine and
// gets persisted or pushed in snapshots.
const SessionQuerySchema = z.object({ sessionId: z.string().min(1) })

// ws hands over a Buffer (its default binaryType); the other forms are handled for completeness
function rawText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString()
  return Buffer.isBuffer(raw) ? raw.toString() : Buffer.from(raw).toString()
}

type Opts = FastifyPluginOptions & { engine: SessionEngine }

export function browserGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { engine } = opts

  app.get('/ws', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket

    getAuthUser(req).then(user => {
      if (!user) {
        socket.close(WsCloseCode.Unauthorized, 'unauthorized')
        return
      }

      const q = SessionQuerySchema.safeParse(req.query)
      if (!q.success) { socket.close(WsCloseCode.MissingSession, 'missing sessionId'); return }
      const { sessionId } = q.data

      const session = engine.getSession(sessionId)
      const snap = engine.getSnapshot(sessionId)
      if (!session || !snap) { socket.close(WsCloseCode.NotFound, 'session not found'); return }
      if (!canAccessSession(user.userId, session)) { socket.close(WsCloseCode.Forbidden, 'forbidden'); return }

      browserConnections.add(sessionId, socket)
      checkSnapshot(snap, msg => app.log.error(msg))
      socket.send(JSON.stringify(snap))

      const onMessage = async (raw: RawData) => {
        let msg: unknown
        try { msg = JSON.parse(rawText(raw)) } catch {
          app.log.warn({ sessionId }, 'ignoring non-JSON client message')
          return
        }
        // Invalid messages are dropped, not fatal: a buggy client shouldn't kick a player out
        const parsed = ClientMessageSchema.safeParse(msg)
        if (!parsed.success) {
          app.log.warn({ sessionId, issues: parsed.error.issues }, 'ignoring invalid client message')
          return
        }
        await engine.onUserAction(sessionId, parsed.data.action)
      }
      socket.on('message', (raw: RawData) => { void onMessage(raw) })

      socket.on('close', () => browserConnections.remove(sessionId, socket))
      socket.on('error', () => browserConnections.remove(sessionId, socket))
    }).catch(() => { socket.close(WsCloseCode.InternalError, 'internal error') })
  })
  done()
}

export function pushSnapshot(sessionId: string, engine: SessionEngine): void {
  const snap = engine.getSnapshot(sessionId)
  if (!snap) return
  checkSnapshot(snap, msg => console.error(msg))
  browserConnections.push(sessionId, snap)
}
