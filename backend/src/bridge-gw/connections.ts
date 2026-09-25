import type { WebSocket } from 'ws'

export type BridgeConn = {
  ws: WebSocket
  boardId: string | null
  bridgeId: string | null
  bootId: string | null
  bmVersion: string | null
  helloReceived: boolean
}

export class BridgeConnections {
  private byBoard: Map<string, BridgeConn> = new Map()
  private all: Set<BridgeConn> = new Set()

  add(conn: BridgeConn): void {
    this.all.add(conn)
  }

  register(conn: BridgeConn, boardId: string): void {
    const existing = this.byBoard.get(boardId)
    if (existing && existing !== conn) {
      existing.ws.close(1001, 'replaced by new connection')
      this.all.delete(existing)
    }
    conn.boardId = boardId
    this.byBoard.set(boardId, conn)
  }

  remove(conn: BridgeConn): void {
    this.all.delete(conn)
    if (conn.boardId) this.byBoard.delete(conn.boardId)
  }

  get(boardId: string): BridgeConn | undefined {
    return this.byBoard.get(boardId)
  }

  connectedBoardIds(): string[] {
    return Array.from(this.byBoard.keys())
  }

  send(boardId: string, msg: unknown): void {
    const conn = this.byBoard.get(boardId)
    if (conn?.ws.readyState === 1) {
      conn.ws.send(JSON.stringify(msg))
    }
  }
}
