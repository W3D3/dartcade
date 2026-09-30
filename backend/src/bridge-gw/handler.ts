import { createHash } from 'crypto'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { WebSocket } from 'ws'
import { bridgeConnections, type BridgeConn } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { insertBridgeEvent, getBoardByTokenHash, updateBoardHardwareId } from '../db/queries.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'

export { bridgeConnections }

type Opts = FastifyPluginOptions & {
  engine: SessionEngine
  db: Kysely<Database>
}

// handleBridgeConnection wires up a single bridge WebSocket. The message
// listener is attached synchronously and message *processing* is gated on the
// token lookup, so the bridge.hello the bridge sends immediately on connect is
// queued behind auth rather than dropped during the async lookup window.
export function handleBridgeConnection(
  socket: WebSocket,
  query: { token?: string },
  opts: { db: Kysely<Database>; engine: SessionEngine },
): void {
  const { db, engine } = opts
  const providedToken = query.token ?? ''
  const tokenHash = createHash('sha256').update(providedToken).digest('hex')

  const conn: BridgeConn = {
    ws: socket,
    boardDbId: null,
    hardwareBoardId: null,
    bridgeId: null, bootId: null,
    bmVersion: null, bmUrl: null, helloReceived: false,
  }

  // Authenticate once. The result gates message processing below.
  const authed = getBoardByTokenHash(db, tokenHash).then(board => {
    if (!board) { socket.close(4401, 'unauthorized'); return false }
    conn.hardwareBoardId = board.hardware_id ?? null
    bridgeConnections.add(conn)
    bridgeConnections.register(conn, board.id)
    return true
  }).catch(() => { socket.close(4500, 'internal error'); return false })

  // Serialize all event processing for this connection to prevent race
  // conditions between rapidly-arriving events, and to hold messages until auth
  // resolves. The listener is registered synchronously so nothing is dropped.
  let eventQueue: Promise<void> = authed.then(() => {})

  socket.on('message', (raw: Buffer) => {
    eventQueue = eventQueue.then(async () => {
      if (!conn.boardDbId) return // unauthenticated (socket already closed)

      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (!conn.helloReceived) {
        if (msg.kind !== 'bridge.hello') { socket.close(4400, 'expected bridge.hello'); return }
        conn.helloReceived = true
        conn.bmVersion = msg.data?.bm_version || null
        conn.bridgeVersion = msg.data?.bridge_version || null
        conn.bmUrl = msg.data?.bm_url ?? null
        return
      }

      if (msg.v !== 1 || typeof msg.seq !== 'number' || typeof msg.kind !== 'string') return

      if (!conn.hardwareBoardId && msg.board_id) {
        conn.hardwareBoardId = msg.board_id
        await updateBoardHardwareId(db, conn.boardDbId, msg.board_id)
      }

      if (conn.bridgeId === null) {
        conn.bridgeId = msg.bridge_id
        conn.bootId = msg.boot_id
      }

      const { inserted } = await insertBridgeEvent(db, {
        bridge_id: msg.bridge_id,
        boot_id: msg.boot_id,
        seq: BigInt(msg.seq),
        board_id: msg.board_id ?? conn.hardwareBoardId ?? conn.boardDbId,
        recv_wall: new Date(msg.recv_wall),
        kind: msg.kind,
        data: msg.data ?? {},
      })

      socket.send(JSON.stringify({ ack: msg.seq }))
      if (!inserted) return

      bridgeConnections.recordEvent(conn.boardDbId, { at: msg.recv_wall, kind: msg.kind, data: msg.data ?? {} })

      await engine.onBridgeEvent(conn.boardDbId, msg.kind, msg.data ?? {}, new Date(msg.recv_wall))
    }).catch(err => { console.error('Bridge event processing error:', err) })
  })

  socket.on('close', () => bridgeConnections.remove(conn))
  socket.on('error', () => bridgeConnections.remove(conn))
}

export async function bridgeGwPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { engine, db } = opts

  app.get('/bridge', { websocket: true }, (connection: SocketStream, req) => {
    handleBridgeConnection(connection.socket, req.query as { token?: string }, { db, engine })
  })
}
