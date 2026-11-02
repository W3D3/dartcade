// Where a dart landed, for judging what it was thrown at.
import { R, SEGS, segmentAt } from '../board.js'
import { AIMS, type Aim } from './aims.js'
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

export type ScoringAim = 20 | 19 | 18 | 17
const NEIGHBOURS: Record<ScoringAim, readonly number[]> = { 20: [5, 1], 19: [7, 3], 18: [1, 4], 17: [3, 2] }
const ORDER: readonly ScoringAim[] = [20, 19, 18, 17]

const AIM_BY_ID: Record<string, Aim> = Object.fromEntries(AIMS.map(a => [a.id, a]))
const trebleCentre = (n: ScoringAim) => AIM_BY_ID[`T${n}`]

/** The scoring treble a dart thrown with more than 170 left was aimed at, or null when it landed
 *  nowhere near one. A dart in 1 or 3 (next to two of them) goes with the visit's other darts. */
export function scoringAim(d: CoachDart, visitDarts: readonly CoachDart[]): ScoringAim | null {
  const n = landedNumber(d)
  if (n === null || n === 25) return null
  const owners = ORDER.filter(a => a === n || NEIGHBOURS[a].includes(n))
  if (owners.length <= 1) return owners[0] ?? null
  const others = visitDarts.filter(o => o !== d)
  const placed = others.filter((o): o is CoachDart & { coords: { x: number; y: number } } => o.coords !== null)
  if (d.coords && placed.length > 0) {
    const mx = placed.reduce((s, o) => s + o.coords.x, 0) / placed.length
    const my = placed.reduce((s, o) => s + o.coords.y, 0) / placed.length
    const dist = (a: ScoringAim) => Math.hypot(trebleCentre(a).x - mx, trebleCentre(a).y - my)
    return owners.reduce((a, b) => (dist(b) < dist(a) ? b : a))
  }
  const count = (a: ScoringAim) => others.filter(o => landedNumber(o) === a).length
  // owners are in ORDER, so a tie keeps the higher-scoring aim
  return owners.reduce((a, b) => (count(b) > count(a) ? b : a))
}
