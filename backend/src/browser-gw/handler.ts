import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { BrowserConnections } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { getAuthUser } from '../auth/session.js'
import { canAccessSession } from '../api/sessions.js'

export const browserConnections = new BrowserConnections()

type Opts = FastifyPluginOptions & { engine: SessionEngine }

export async function browserGwPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { engine } = opts

  app.get('/ws', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket

    getAuthUser(req).then(user => {
      if (!user) {
        socket.close(4401, 'unauthorized')
        return
      }

      const sessionId = (req.query as any).sessionId as string | undefined
      if (!sessionId) { socket.close(4400, 'missing sessionId'); return }

      const session = engine.getSession(sessionId)
      const snap = engine.getSnapshot(sessionId)
      if (!session || !snap) { socket.close(4404, 'session not found'); return }
      if (!canAccessSession(user.userId, session)) { socket.close(4403, 'forbidden'); return }

      browserConnections.add(sessionId, socket)
      socket.send(JSON.stringify(snap))

      socket.on('message', async (raw) => {
        let msg: any
        try { msg = JSON.parse(raw.toString()) } catch { return }
        if (msg.type === 'user_action' && msg.action) {
          await engine.onUserAction(sessionId, msg.action)
        }
      })

      socket.on('close', () => browserConnections.remove(sessionId, socket))
      socket.on('error', () => browserConnections.remove(sessionId, socket))
    }).catch(() => socket.close(4500, 'internal error'))
  })
}

export function pushSnapshot(sessionId: string, engine: SessionEngine): void {
  const snap = engine.getSnapshot(sessionId)
  if (snap) browserConnections.push(sessionId, snap)
}
