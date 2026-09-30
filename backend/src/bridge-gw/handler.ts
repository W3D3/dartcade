import { createHash } from 'crypto'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { WebSocket } from 'ws'
import { bridgeConnections, type BridgeConn } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { insertBridgeEvent, getBoardByTokenHash, updateBoardHardwareId } from '../db/queries.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { isNumber, isRecord, isString } from '../guards.js'

export { bridgeConnections }

type Opts = FastifyPluginOptions & {
  engine: SessionEngine
  db: Kysely<Database>
}

function nonEmptyString(v: unknown): string | null {
  return isString(v) && v !== '' ? v : null
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
      const boardDbId = conn.boardDbId
      if (!boardDbId) return // unauthenticated (socket already closed)

      let parsed: unknown
      try { parsed = JSON.parse(raw.toString()) } catch { return }
      const msg: Record<string, unknown> = isRecord(parsed) ? parsed : {}

      if (!conn.helloReceived) {
        if (msg.kind !== 'bridge.hello') { socket.close(4400, 'expected bridge.hello'); return }
        const hello: Record<string, unknown> = isRecord(msg.data) ? msg.data : {}
        conn.helloReceived = true
        conn.bmVersion = nonEmptyString(hello.bm_version)
        conn.bridgeVersion = nonEmptyString(hello.bridge_version)
        conn.bmUrl = isString(hello.bm_url) ? hello.bm_url : null
        return
      }

      const { seq, kind, bridge_id: bridgeId, boot_id: bootId, recv_wall: recvWall } = msg
      if (msg.v !== 1 || !isNumber(seq) || !isString(kind)) return
      // Envelope fields the event can't be stored without (schema/adbridge-v1.json)
      if (!isString(bridgeId) || !isString(bootId) || !isString(recvWall)) return
      const hardwareId = isString(msg.board_id) ? msg.board_id : undefined
      const data = msg.data ?? {}

      if (!conn.hardwareBoardId && hardwareId) {
        conn.hardwareBoardId = hardwareId
        await updateBoardHardwareId(db, boardDbId, hardwareId)
      }

      if (conn.bridgeId === null) {
        conn.bridgeId = bridgeId
        conn.bootId = bootId
      }

      const { inserted } = await insertBridgeEvent(db, {
        bridge_id: bridgeId,
        boot_id: bootId,
        seq: BigInt(seq),
        board_id: hardwareId ?? conn.hardwareBoardId ?? boardDbId,
        recv_wall: new Date(recvWall),
        kind,
        data,
      })

      socket.send(JSON.stringify({ ack: seq }))
      if (!inserted) return

      bridgeConnections.recordEvent(boardDbId, { at: recvWall, kind, data })

      await engine.onBridgeEvent(boardDbId, kind, data)
    }).catch((err: unknown) => { console.error('Bridge event processing error:', err) })
  })

  socket.on('close', () => { bridgeConnections.remove(conn) })
  socket.on('error', () => { bridgeConnections.remove(conn) })
}

export function bridgeGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { engine, db } = opts

  app.get('/bridge', { websocket: true }, (connection: SocketStream, req) => {
    const token = isRecord(req.query) && isString(req.query.token) ? req.query.token : undefined
    handleBridgeConnection(connection.socket, { token }, { db, engine })
  })
  done()
}
