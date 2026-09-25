import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { BrowserConnections } from './connections.js'
import type { SessionEngine } from '../session/engine.js'

export const browserConnections = new BrowserConnections()

type Opts = FastifyPluginOptions & { engine: SessionEngine }

export async function browserGwPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { engine } = opts

  app.get('/ws', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket
    const sessionId = (req.query as any).sessionId as string | undefined
    if (!sessionId) {
      socket.close(4400, 'missing sessionId')
      return
    }

    const snap = engine.getSnapshot(sessionId)
    if (!snap) {
      socket.close(4404, 'session not found')
      return
    }

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
  })
}

export function pushSnapshot(sessionId: string, engine: SessionEngine): void {
  const snap = engine.getSnapshot(sessionId)
  if (snap) browserConnections.push(sessionId, snap)
}
