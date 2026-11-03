// Where a dart landed, for judging what it was thrown at.
import { R, SEGS, segmentAt } from '../board.js'
import { AIMS } from './aims.js'
import type { CoachDart } from './walk.js'

/** The number a dart landed in: 1–20, 25 for the bull and 25, or null for a miss we can't place. */
export function landedNumber(d: CoachDart): number | null {
  const { number, multiplier } = d.segment
  if (number === 50 || number === 25) return 25
  if (multiplier > 0 && number >= 1 && number <= 20) return number
  if (!d.coords) return null
  const s = segmentAt(d.coords.x, d.coords.y)
  return s.number === 50 ? 25 : s.number
}

/** `n` and its two neighbours on the board; just 25 for the bull and 25. */
const withNeighbours = (n: number): number[] => {
  const i = SEGS.indexOf(n)
  return i < 0 ? [n] : [SEGS[(i + 19) % 20], n, SEGS[(i + 1) % 20]]
}

/** A single that may have been thrown at the bull or 25: it landed inside the inner single ring, or
 *  it has no position to tell. */
export const nearBull = (d: CoachDart): boolean =>
  d.segment.multiplier === 1 &&
  d.segment.number >= 1 &&
  d.segment.number <= 20 &&
  (d.coords === null || Math.hypot(d.coords.x, d.coords.y) < R.si)

/** The aims (AIMS indexes) a dart in number `n` could have been thrown at: any aim on `n` or on
 *  either neighbour, since drifting a wedge sideways is the most common miss there is; with
 *  `bull`, the bull and 25 too, whose misses spread into every inner single. */
export const candidates = (n: number, bull = false): number[] => {
  const near = withNeighbours(n)
  if (bull) near.push(25)
  return AIMS.flatMap((a, i) => (a.numbers.some(m => near.includes(m)) ? [i] : []))
}
