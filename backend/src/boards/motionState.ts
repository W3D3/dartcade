import type { MotionStateData } from '../schema/types.js'

export type MotionReport = MotionStateData & { since: string }

/** The last motion state each board's bridge sent (in memory, gone when the bridge drops). Absent: unknown (old bridge, or offline). */
export class MotionState {
  private byBoard = new Map<string, MotionReport>()

  set(boardId: string, m: MotionStateData, since: string): void {
    this.byBoard.set(boardId, { ...m, since })
  }

  get(boardId: string): MotionReport | null {
    return this.byBoard.get(boardId) ?? null
  }

  clear(boardId: string): void {
    this.byBoard.delete(boardId)
  }
}

export const motionState = new MotionState()
