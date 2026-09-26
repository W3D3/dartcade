import { createHash } from 'crypto'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { bridgeConnections } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { insertBridgeEvent, getBoardByTokenHash, updateBoardHardwareId } from '../db/queries.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'

export { bridgeConnections }

type Opts = FastifyPluginOptions & {
  engine: SessionEngine
  db: Kysely<Database>
}

export async function bridgeGwPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { engine, db } = opts

  app.get('/bridge', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket
    const providedToken = (req.query as any).token ?? ''

    const tokenHash = createHash('sha256').update(providedToken).digest('hex')

    getBoardByTokenHash(db, tokenHash).then(board => {
      if (!board) {
        socket.close(4401, 'unauthorized')
        return
      }

      const conn = {
        ws: socket,
        boardDbId: board.id,
        hardwareBoardId: board.hardware_id ?? null,
        bridgeId: null, bootId: null,
        bmVersion: null, bmUrl: null, helloReceived: false,
      }
      bridgeConnections.add(conn)
      bridgeConnections.register(conn, board.id)

      socket.on('message', async (raw) => {
        let msg: any
        try { msg = JSON.parse(raw.toString()) } catch { return }

        if (!conn.helloReceived) {
          if (msg.kind !== 'bridge.hello') { socket.close(4400, 'expected bridge.hello'); return }
          conn.helloReceived = true
          conn.bmVersion = msg.data?.bm_version ?? null
          conn.bmUrl = msg.data?.bm_url ?? null
          return
        }

        if (msg.v !== 1 || typeof msg.seq !== 'number' || typeof msg.kind !== 'string') return

        if (!conn.hardwareBoardId && msg.board_id) {
          conn.hardwareBoardId = msg.board_id
          await updateBoardHardwareId(db, conn.boardDbId!, msg.board_id)
        }

        if (conn.bridgeId === null) {
          conn.bridgeId = msg.bridge_id
          conn.bootId = msg.boot_id
        }

        const { inserted } = await insertBridgeEvent(db, {
          bridge_id: msg.bridge_id,
          boot_id: msg.boot_id,
          seq: BigInt(msg.seq),
          board_id: msg.board_id ?? conn.hardwareBoardId ?? conn.boardDbId!,
          recv_wall: new Date(msg.recv_wall),
          kind: msg.kind,
          data: msg.data ?? {},
        })

        socket.send(JSON.stringify({ ack: msg.seq }))
        if (!inserted) return

        await engine.onBridgeEvent(conn.boardDbId!, msg.kind, msg.data ?? {}, new Date(msg.recv_wall))
      })

      socket.on('close', () => bridgeConnections.remove(conn))
      socket.on('error', () => bridgeConnections.remove(conn))
    }).catch(() => socket.close(4500, 'internal error'))
  })
}
