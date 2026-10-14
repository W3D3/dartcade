// Undo/redo for the hole editor: a bounded stack of Hole snapshots. Framework-free; the editor
// page wraps it in runes.
import type { Hole } from '$shared/minigolf/types'

export interface History {
  /** Records `h` as the current hole, moving the previous one onto the undo stack and dropping
   *  any redo branch. */
  push(h: Hole): void
  /** The hole before the last push, or null with nothing to undo. */
  undo(): Hole | null
  /** The hole undone past, or null with nothing to redo. */
  redo(): Hole | null
  canUndo: boolean
  canRedo: boolean
}

export function createHistory(initial: Hole, limit = 100): History {
  let current = initial
  const past: Hole[] = []
  let future: Hole[] = []

  return {
    push(h) {
      past.push(current)
      if (past.length > limit) past.shift()
      current = h
      future = []
    },
    undo() {
      const prev = past.pop()
      if (prev === undefined) return null
      future.push(current)
      current = prev
      return current
    },
    redo() {
      const next = future.pop()
      if (next === undefined) return null
      past.push(current)
      current = next
      return current
    },
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
  }
}
