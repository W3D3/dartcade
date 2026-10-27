export type BigScreenReport = { helper: boolean; running: boolean }

const NONE: BigScreenReport = { helper: false, running: false }

/** What each board's bridge last said about its big-screen helper (in memory, gone when the bridge drops). */
export class BigScreenState {
  private byBoard = new Map<string, BigScreenReport>()

  set(boardId: string, s: BigScreenReport): void {
    this.byBoard.set(boardId, s)
  }

  get(boardId: string): BigScreenReport {
    return this.byBoard.get(boardId) ?? NONE
  }

  clear(boardId: string): void {
    this.byBoard.delete(boardId)
  }
}

export const bigScreenState = new BigScreenState()
