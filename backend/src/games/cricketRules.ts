// Cricket's rules, pure: what a dart is worth in marks, what marks do to the board, and who has
// won the leg. Shared by the reducer, the bot and the tests (see games/cricket.ts).
import type { Dart } from '../session/types.js'

export type CricketMode = 'standard' | 'cutthroat'

export const TARGETS: readonly number[] = [20, 19, 18, 17, 16, 15, 25]
/** Marks that open a target. */
export const OPEN = 3

/** Per team: marks per target (0–OPEN) and points. */
export type Marks = { targets: readonly number[]; marks: number[][]; points: number[] }

export function emptyMarks(teams: number, targets: readonly number[] = TARGETS): Marks {
  return { targets, marks: Array.from({ length: teams }, () => targets.map(() => 0)), points: Array<number>(teams).fill(0) }
}

/** The target a dart hits and its marks; null for a miss or a number that isn't a target. */
export function marksFor(dart: Dart, targets: readonly number[]): { target: number; marks: number } | null {
  const { number, multiplier } = dart.segment
  // The bullseye arrives as 50 (Board Manager, manual entry) with any multiplier, or as a double 25
  if (number === 50) {
    const target = targets.indexOf(25)
    return target < 0 ? null : { target, marks: 2 }
  }
  if (multiplier === 0) return null
  const target = targets.indexOf(number)
  if (target < 0) return null
  return { target, marks: multiplier }
}

/** `n` marks for `team` on `target`: they open it first, then score while an opponent hasn't opened it. */
export function applyMarks(
  b: Marks,
  team: number,
  target: number,
  n: number,
  mode: CricketMode,
): { board: Marks; counted: number; scored: number } {
  const have = b.marks[team][target]
  const opening = Math.min(n, OPEN - have)
  const extra = n - opening
  const stillOpen = b.marks.flatMap((row, t) => (t !== team && row[target] < OPEN ? [t] : []))
  const scored = stillOpen.length > 0 ? extra * b.targets[target] : 0
  const marks = b.marks.map((row, t) => (t === team ? row.map((m, i) => (i === target ? m + opening : m)) : row))
  const points = b.points.map((p, t) => {
    if (mode === 'standard') return t === team ? p + scored : p
    return stillOpen.includes(t) ? p + scored : p
  })
  return { board: { ...b, marks, points }, counted: opening + (scored > 0 ? extra : 0), scored }
}

/** The team that has won the leg: every target opened and not behind (cut-throat: not ahead). The thrower's team first. */
export function legWinner(b: Marks, thrower: number, mode: CricketMode): number | null {
  const wins = (t: number) => {
    if (!b.marks[t].every(m => m >= OPEN)) return false
    const others = b.points.filter((_, i) => i !== t)
    return mode === 'standard' ? others.every(p => b.points[t] >= p) : others.every(p => b.points[t] <= p)
  }
  if (wins(thrower)) return thrower
  const other = b.marks.findIndex((_, t) => t !== thrower && wins(t))
  return other < 0 ? null : other
}
