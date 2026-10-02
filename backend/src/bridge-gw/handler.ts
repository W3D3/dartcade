import { createHash } from 'crypto'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { WebSocket } from 'ws'
import { bridgeConnections, type BridgeConn } from './connections.js'
import type { SessionEngine } from '../session/engine.js'
import { insertBridgeEvent, getBoardByTokenHash, updateBoardHardwareId } from '../db/queries.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { z } from 'zod'
import { BaseEnvelopeSchema } from '../schema/zod.js'

export { bridgeConnections }

type Opts = FastifyPluginOptions & {
  engine: SessionEngine
  db: Kysely<Database>
}


// The envelope fields an event is stored and acked by (schema/adbridge-v1.json). The rest
// of BaseEnvelope (bm_version, recv_mono_ns, …) isn't required, as before.
const EnvelopeSchema = BaseEnvelopeSchema
  .pick({ v: true, seq: true, kind: true, bridge_id: true, boot_id: true, recv_wall: true })
  .extend({ board_id: z.string().optional(), data: z.unknown() })

export function parseEnvelope(msg: unknown): z.output<typeof EnvelopeSchema> | null {
  const r = EnvelopeSchema.safeParse(msg)
  if (r.success) return r.data
  // Not acked, so the bridge's next (cumulative) ack covers it: this warning is the only trace
  const id = EventIdSchema.parse(msg)
  console.warn('Ignoring a bridge event whose envelope does not match the schema', { ...id, issues: r.error.issues })
  return null
}

// What identifies an event in a log line, as far as the message has it
const EventIdSchema = z.object({ kind: z.unknown(), seq: z.unknown() }).partial().catch({})

// bridge.hello is informational: each field is kept or dropped on its own
const nonEmpty = z.string().min(1).nullable().catch(null)
const HelloSchema = z.object({
  bridge_version: nonEmpty.default(null),
  bm_version: nonEmpty.default(null),
  bm_url: z.string().nullable().catch(null).default(null),
}).catch({ bridge_version: null, bm_version: null, bm_url: null })

export function parseHello(data: unknown): { bridgeVersion: string | null; bmVersion: string | null; bmUrl: string | null } {
  const h = HelloSchema.parse(data)
  return { bridgeVersion: h.bridge_version, bmVersion: h.bm_version, bmUrl: h.bm_url }
}

// The bridge's keepalive (bridge/internal/transport): not an event, never acked. Any
// message from us resets the bridge's read deadline, so it gets a pong back.
const PingSchema = z.object({ ping: z.string() })

const MessageKindSchema = z.object({ kind: z.string(), data: z.unknown() }).partial()
const TokenQuerySchema = z.object({ token: z.string() })

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
    engine.onBoardPresence(board.id)
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

      if (!conn.helloReceived) {
        const first = MessageKindSchema.safeParse(parsed)
        if (!first.success || first.data.kind !== 'bridge.hello') { socket.close(4400, 'expected bridge.hello'); return }
        const hello = parseHello(first.data.data)
        conn.helloReceived = true
        conn.bmVersion = hello.bmVersion
        conn.bridgeVersion = hello.bridgeVersion
        conn.bmUrl = hello.bmUrl
        return
      }

      const ping = PingSchema.safeParse(parsed)
      if (ping.success) { socket.send(JSON.stringify({ pong: ping.data.ping })); return }

      const env = parseEnvelope(parsed)
      if (!env) return
      const { seq, kind, bridge_id: bridgeId, boot_id: bootId, recv_wall: recvWall } = env
      const hardwareId = env.board_id
      const data = env.data ?? {}

      if (!conn.hardwareBoardId && hardwareId) {
        conn.hardwareBoardId = hardwareId
        await updateBoardHardwareId(db, boardDbId, hardwareId)
      }

      if (conn.bridgeId === null) {
        conn.bridgeId = bridgeId
        conn.bootId = bootId
      }

      const { inserted, id } = await insertBridgeEvent(db, {
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

      // Already acked: a failure here (e.g. the game's log write) drops this input, so
      // name the board and event to keep the dropped dart traceable
      try {
        await engine.onBridgeEvent(boardDbId, kind, data, id)
      } catch (err: unknown) {
        console.error('Bridge event not applied to the game:', { boardDbId, kind, seq, bridgeEventId: id }, err)
      }
    }).catch((err: unknown) => { console.error('Bridge event processing error:', { boardDbId: conn.boardDbId }, err) })
  })

  socket.on('close', () => {
    const boardDbId = conn.boardDbId
    bridgeConnections.remove(conn)
    if (boardDbId) engine.onBoardPresence(boardDbId)
  })
  socket.on('error', () => {
    const boardDbId = conn.boardDbId
    bridgeConnections.remove(conn)
    if (boardDbId) engine.onBoardPresence(boardDbId)
  })
}

export function bridgeGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { engine, db } = opts

  app.get('/bridge', { websocket: true }, (connection: SocketStream, req) => {
    const q = TokenQuerySchema.safeParse(req.query)
    handleBridgeConnection(connection.socket, { token: q.success ? q.data.token : undefined }, { db, engine })
  })
  done()
}
