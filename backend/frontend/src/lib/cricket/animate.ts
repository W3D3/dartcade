// Which marks on the Cricket table draw in: per seat and target, the marks a cell had before
// this snapshot. A cell only animates (from < marks) when one dart raised one target: a first
// snapshot, a new leg, an undo, a lowering correction or a reconnect that brings several
// changes at once all show their marks as they are.
import type { CricketGame } from '../api/game-ws'

type Marks = Pick<CricketGame, 'marks' | 'legs'>

export function markDeltas(prev: Marks | null, next: Marks): number[][] {
  const still = next.marks
  if (!prev || prev.marks.length !== next.marks.length || prev.legs.join() !== next.legs.join()) return still
  const raised = new Set<number>()
  for (const [s, row] of next.marks.entries()) {
    for (const [i, m] of row.entries()) {
      const was = prev.marks[s][i]
      if (m < was) return still
      if (m > was) raised.add(i)
    }
  }
  // One dart hits one target: more than one raised is a reconnect or a correction
  return raised.size === 1 ? prev.marks : still
}
