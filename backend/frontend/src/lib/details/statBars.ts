// The comparison bars of the details page (and the win screen's duel): how long each side's bar is
// and whose value is the better one, for any row the server sends.
import type { StatRow } from '../api'
import { betterIndexes, formatStat, statNumber } from './stats.js'

export const share = (a: number, b: number) => (a + b > 0 ? a / (a + b) : 0.5)

/** The left side's part of a duel bar: the bar leans to the better value, so with fewer-is-better
 *  it is the other side's number that counts (fewer darts for the best leg). */
export function duelShare(row: Pick<StatRow, 'better'>, a: number, b: number): number {
  return row.better === 'lower' && a > 0 && b > 0 ? share(b, a) : share(a, b)
}

export type BarCell = {
  index: number
  text: string
  /** 0 to 1, against the longest bar of the row; 0 when the stat doesn't apply */
  fraction: number
  best: boolean
}

/** One row for any number of sides: each side's text, bar length (its value against the row's
 *  largest) and whether it holds the best value. */
export function barCells(row: StatRow, sides: { index: number; values: Record<string, number> }[]): BarCell[] {
  const best = betterIndexes(row, sides)
  const nums = sides.map(s => statNumber(row, s.values))
  const max = Math.max(0, ...nums.map(n => n ?? 0))
  return sides.map((s, i) => ({
    index: s.index,
    text: formatStat(row, s.values),
    fraction: max > 0 ? (nums[i] ?? 0) / max : 0,
    best: best.has(s.index),
  }))
}
