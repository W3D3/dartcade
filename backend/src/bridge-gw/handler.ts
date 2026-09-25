import { createHash, timingSafeEqual } from 'crypto'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { BridgeConnections } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { insertBridgeEvent } from '../db/queries.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'

export function checkSecret(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export const bridgeConnections = new BridgeConnections()

type Opts = FastifyPluginOptions & {
  secret: string
  engine: SessionEngine
  db: Kysely<Database>
}

export async function bridgeGwPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { secret, engine, db } = opts

  app.get('/bridge', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket
    const provided = (req.query as any).secret ?? ''
    if (!checkSecret(provided, secret)) {
      socket.close(4401, 'unauthorized')
      return
    }

    const conn = {
      ws: socket, boardId: null, bridgeId: null, bootId: null,
      bmVersion: null, helloReceived: false,
    }
    bridgeConnections.add(conn)

    socket.on('message', async (raw) => {
      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (!conn.helloReceived) {
        if (msg.kind !== 'bridge.hello') {
          socket.close(4400, 'expected bridge.hello')
          return
        }
        conn.helloReceived = true
        conn.bmVersion = msg.data?.bm_version ?? null
        return
      }

      // Validate envelope fields
      if (msg.v !== 1 || typeof msg.seq !== 'number' || typeof msg.kind !== 'string') return

      // Register board on first envelope
      if (!conn.boardId) {
        conn.bridgeId = msg.bridge_id
        conn.bootId = msg.boot_id
        bridgeConnections.register(conn, msg.board_id)
      }

      // Persist; dedup via ON CONFLICT
      const { inserted } = await insertBridgeEvent(db, {
        bridge_id: msg.bridge_id,
        boot_id: msg.boot_id,
        seq: BigInt(msg.seq),
        board_id: msg.board_id,
        recv_wall: new Date(msg.recv_wall),
        kind: msg.kind,
        data: msg.data ?? {},
      })

      // Always ack
      socket.send(JSON.stringify({ ack: msg.seq }))

      if (!inserted) return // duplicate — skip dispatch

      await engine.onBridgeEvent(msg.board_id, msg.kind, msg.data ?? {}, new Date(msg.recv_wall))
    })

    socket.on('close', () => bridgeConnections.remove(conn))
    socket.on('error', () => bridgeConnections.remove(conn))
  })
}
