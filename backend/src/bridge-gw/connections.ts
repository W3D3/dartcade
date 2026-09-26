import type { WebSocket } from 'ws'

export type BridgeConn = {
  ws: WebSocket
  boardDbId: string | null       // boards.id ULID — engine key
  hardwareBoardId: string | null // board_id from wire — stored in bridge_events
  bridgeId: string | null
  bootId: string | null
  bmVersion: string | null
  bmUrl: string | null
  helloReceived: boolean
}

export class BridgeConnections {
  private byBoard: Map<string, BridgeConn> = new Map()
  private all: Set<BridgeConn> = new Set()

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

  send(boardDbId: string, msg: unknown): void {
    const conn = this.byBoard.get(boardDbId)
    if (conn?.ws.readyState === 1) conn.ws.send(JSON.stringify(msg))
  }
}

export const bridgeConnections = new BridgeConnections()
