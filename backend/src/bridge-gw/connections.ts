import type { WebSocket } from 'ws'
import type { components } from '../schema/api.js'
import { isOneOf, isOptional, isRecord } from '../guards.js'
import { isDart } from '../session/boardEvent.js'

export type BridgeConn = {
  ws: WebSocket
  boardDbId: string | null       // boards.id ULID — engine key
  hardwareBoardId: string | null // board_id from wire — stored in bridge_events
  bridgeId: string | null
  bootId: string | null
  bmVersion: string | null
  bridgeVersion?: string | null  // from bridge.hello
  bmUrl: string | null
  helloReceived: boolean
}

/** A bridge event as received. */
export type BoardEvent = { at: string; kind: string; data: unknown }

/** An event of the Boards page live feed (BoardEvent in schema/api-v1.yaml). */
export type FeedEvent = components['schemas']['BoardEvent']

// Kinds worth surfacing in the Boards page live feed. High-rate frames
// (bm.frame, motion) are deliberately excluded.
const FEED_KINDS = ['dart.detected', 'dart.corrected', 'takeout.started', 'visit.cleared'] as const
const FEED_LIMIT = 50

function isFeedData(v: unknown): v is FeedEvent['data'] {
  return isRecord(v) && isOptional(v.dart, isDart)
}

export class BridgeConnections {
  private byBoard: Map<string, BridgeConn> = new Map()
  private all: Set<BridgeConn> = new Set()
  private feeds: Map<string, FeedEvent[]> = new Map()

  add(conn: BridgeConn): void { this.all.add(conn) }

  register(conn: BridgeConn, boardDbId: string): void {
    const existing = this.byBoard.get(boardDbId)
    if (existing && existing !== conn) {
      existing.ws.close(1001, 'replaced by new connection')
      this.all.delete(existing)
    }
    conn.boardDbId = boardDbId
    this.byBoard.set(boardDbId, conn)
  }

  remove(conn: BridgeConn): void {
    this.all.delete(conn)
    if (conn.boardDbId) this.byBoard.delete(conn.boardDbId)
  }

  get(boardDbId: string): BridgeConn | undefined {
    return this.byBoard.get(boardDbId)
  }

  isOnline(boardDbId: string): boolean {
    return this.byBoard.has(boardDbId)
  }

  connectedBoardIds(): string[] {
    return Array.from(this.byBoard.keys())
  }

  recordEvent(boardDbId: string, ev: BoardEvent): void {
    const { at, kind, data } = ev
    // Data that doesn't match the feed's schema (a malformed dart) is left out too
    if (!isOneOf(FEED_KINDS, kind) || !isFeedData(data)) return
    const feed = this.feeds.get(boardDbId) ?? []
    feed.push({ at, kind, data })
    if (feed.length > FEED_LIMIT) feed.splice(0, feed.length - FEED_LIMIT)
    this.feeds.set(boardDbId, feed)
  }

  recentEvents(boardDbId: string): FeedEvent[] {
    return this.feeds.get(boardDbId) ?? []
  }

  send(boardDbId: string, msg: unknown): void {
    const conn = this.byBoard.get(boardDbId)
    if (conn?.ws.readyState === 1) conn.ws.send(JSON.stringify(msg))
  }
}

export const bridgeConnections = new BridgeConnections()
