import type { WebSocket } from 'ws'
import { BridgeCloseCode } from '../schema/bridge-close.js'
import type { components } from '../schema/api.js'
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import { FeedEventDataSchema, type BmRequestDataSchema, type BmResponseMessageSchema } from '../schema/zod.js'

export type BridgeConn = {
  ws: WebSocket
  boardDbId: string | null // boards.id ULID — engine key
  hardwareBoardId: string | null // board_id from wire — stored in bridge_events
  bridgeId: string | null
  bootId: string | null
  bmVersion: string | null
  bridgeVersion?: string | null // from bridge.hello
  bmUrl: string | null
  /** From bridge.hello: it can update itself (bridge.update). */
  bridgeUpdatable: boolean
  /** Its socket to the Board Manager is up (bridge.hello, then each bm.link); null: the bridge doesn't say (0.13 and older). */
  bmUp?: boolean | null
  helloReceived: boolean
  connectedAt: Date
}

/** A bridge event as received. */
export type BoardEvent = { at: string; kind: string; data: unknown }

/** A Board Manager call the bridge makes for the backend (bm.request without its id). */
export type BmRequest = Omit<z.infer<typeof BmRequestDataSchema>, 'id'>
/** The bridge's answer to it. */
export type BmResponse = z.infer<typeof BmResponseMessageSchema>['data']

type PendingRequest = { conn: BridgeConn; settle: (res: BmResponse | null) => void }

/** An event of the Boards page live feed (BoardEvent in schema/api-v1.yaml). */
export type FeedEvent = components['schemas']['BoardEvent']

// Kinds worth surfacing in the Boards page live feed. High-rate frames
// (bm.frame, motion) are deliberately excluded.
const FEED_KINDS = ['dart.detected', 'dart.corrected', 'takeout.started', 'visit.cleared'] as const
function isFeedKind(k: string): k is FeedEvent['kind'] {
  return FEED_KINDS.some(f => f === k)
}
const FEED_LIMIT = 50

/** Bridges ping every 20 s: one silent for this long is wedged, though its socket may stay open. */
export const BRIDGE_SILENCE_MS = 60_000

export class BridgeConnections {
  private byBoard: Map<string, BridgeConn> = new Map()
  private all: Set<BridgeConn> = new Set()
  private feeds: Map<string, FeedEvent[]> = new Map()
  private pending: Map<string, PendingRequest> = new Map()
  private lastSeen: Map<BridgeConn, number> = new Map()

  add(conn: BridgeConn, now = Date.now()): void {
    this.all.add(conn)
    this.lastSeen.set(conn, now)
  }

  /** The bridge sent something: it is alive. */
  seen(conn: BridgeConn, now = Date.now()): void {
    if (this.lastSeen.has(conn)) this.lastSeen.set(conn, now)
  }

  /** Drops the bridges that sent nothing for BRIDGE_SILENCE_MS, so a wedged one shows offline instead of online. */
  closeSilent(now = Date.now()): void {
    for (const [conn, at] of this.lastSeen) if (now - at > BRIDGE_SILENCE_MS) conn.ws.terminate()
  }

  register(conn: BridgeConn, boardDbId: string): void {
    const existing = this.byBoard.get(boardDbId)
    if (existing && existing !== conn) {
      existing.ws.close(BridgeCloseCode.GoingAway, 'replaced by new connection')
      this.all.delete(existing)
    }
    conn.boardDbId = boardDbId
    this.byBoard.set(boardDbId, conn)
  }

  remove(conn: BridgeConn): void {
    this.all.delete(conn)
    this.lastSeen.delete(conn)
    // A replaced connection closes after its successor registered: keep the successor
    if (conn.boardDbId && this.byBoard.get(conn.boardDbId) === conn) this.byBoard.delete(conn.boardDbId)
    for (const p of this.pending.values()) if (p.conn === conn) p.settle(null)
  }

  get(boardDbId: string): BridgeConn | undefined {
    return this.byBoard.get(boardDbId)
  }

  isOnline(boardDbId: string): boolean {
    return this.byBoard.has(boardDbId)
  }

  /** The connected bridge of each of these boards (a bridge fronts one board per connection). */
  connectedFor(boardDbIds: string[]): { boardDbId: string; conn: BridgeConn }[] {
    return boardDbIds.flatMap(boardDbId => {
      const conn = this.byBoard.get(boardDbId)
      return conn ? [{ boardDbId, conn }] : []
    })
  }

  /** Connected bridge sockets, and the boards they registered. */
  counts(): { bridges: number; boards: number } {
    return { bridges: this.all.size, boards: this.byBoard.size }
  }

  /** Sends a JSON message to the board's bridge; false when it's not connected (or hasn't said hello). */
  send(boardDbId: string, msg: object): boolean {
    const conn = this.byBoard.get(boardDbId)
    if (!conn?.helloReceived || conn.ws.readyState !== conn.ws.OPEN) return false
    conn.ws.send(JSON.stringify(msg))
    return true
  }

  /** Has the board's bridge call its Board Manager (the backend never reaches the board's network
   *  itself): its answer, or null when the bridge isn't connected, drops or doesn't answer in time
   *  (bridges before bm.request ignore it). */
  request(boardDbId: string, req: BmRequest, timeoutMs: number): Promise<BmResponse | null> {
    const conn = this.byBoard.get(boardDbId)
    const id = randomUUID()
    if (!conn || !this.send(boardDbId, { kind: 'bm.request', data: { id, ...req } })) return Promise.resolve(null)
    return new Promise(resolve => {
      const settle = (res: BmResponse | null) => {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve(res)
      }
      const timer = setTimeout(() => settle(null), timeoutMs)
      this.pending.set(id, { conn, settle })
    })
  }

  /** A bridge's bm.response: settles the request it answers, if that bridge was asked. */
  respond(conn: BridgeConn, res: BmResponse): void {
    const p = this.pending.get(res.id)
    if (p?.conn === conn) p.settle(res)
  }

  recordEvent(boardDbId: string, ev: BoardEvent): void {
    const { at, kind, data } = ev
    // Data that doesn't match the feed's schema (a malformed dart) is left out too
    const parsed = FeedEventDataSchema.safeParse(data)
    if (!isFeedKind(kind) || !parsed.success) return
    const feed = this.feeds.get(boardDbId) ?? []
    feed.push({ at, kind, data: parsed.data })
    if (feed.length > FEED_LIMIT) feed.splice(0, feed.length - FEED_LIMIT)
    this.feeds.set(boardDbId, feed)
  }

  recentEvents(boardDbId: string): FeedEvent[] {
    return this.feeds.get(boardDbId) ?? []
  }
}

export const bridgeConnections = new BridgeConnections()
