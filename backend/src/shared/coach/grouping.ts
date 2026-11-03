// How a visit's darts sat together: their spread around their middle, how far that middle is from
// their shared target and how close they came to their targets' beds; and the visit's rating, its
// score plus a bonus for each. Only darts the camera placed count: a typed dart has no position.
import { aimById } from './aims.js'
import { LEVEL_AVERAGE, LEVEL_SIGMA, SIGMA_JITTER } from '../botLevels.js'
import { MM_PER_UNIT, type DartClass } from './dartClass.js'

// --- The rating's bonuses, to be tuned with the admin sandbox ---
/** Points for a group of 0 mm spread, falling to none at GROUPING_ZERO_MM */
export const GROUPING_MAX = 15
export const GROUPING_ZERO_MM = 30
/** Points for darts on their targets' beds (edgeMm 0), falling to none at CLOSENESS_ZERO_MM */
export const CLOSENESS_MAX = 8
export const CLOSENESS_ZERO_MM = 40

export type Grouping = {
  /** The darts it used: walked, with camera coords and a target */
  darts: number
  /** Their mean distance from their centroid; null unless they share a target (T20 then T19 is no group) */
  spreadMm: number | null
  /** The centroid's distance from that shared target's point; null without one */
  offsetMm: number | null
  /** Their mean edgeMm: how close they came to their targets' beds */
  edgeMm: number
  /** The visit's score plus the grouping and closeness bonuses */
  rating: number
  /** The spread a player of this average groups `darts` darts in (expectedSpreadMm) */
  expectedSpreadMm: number
  /** The spread against that expectation; null without a spread or when it's unremarkable */
  comment: GroupingComment | null
}

type Placed = { coords: { x: number; y: number } | null; class: Pick<DartClass, 'target' | 'edgeMm'> }

/** A bonus of `max` at 0 mm, falling linearly to 0 at `zero` mm; 0 without a value */
const bonus = (mm: number | null, max: number, zero: number) => (mm === null ? 0 : max * Math.max(0, 1 - mm / zero))

/** The visit's grouping from its walked darts (those after a bust left out), its score and the
 *  player's 3-dart average; null with fewer than 2 placed darts, the rating then being the score. */
export function grouping(darts: readonly Placed[], scored: number, average: number): Grouping | null {
  const placed = darts.flatMap(d =>
    d.coords && d.class.target && d.class.edgeMm !== null ? [{ ...d.coords, aimId: d.class.target.aimId, edgeMm: d.class.edgeMm }] : [],
  )
  if (placed.length < 2) return null
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const c = { x: mean(placed.map(p => p.x)), y: mean(placed.map(p => p.y)) }
  const aim = placed.every(p => p.aimId === placed[0].aimId) ? aimById(placed[0].aimId) : undefined
  const spreadMm = aim ? mean(placed.map(p => Math.hypot(p.x - c.x, p.y - c.y))) * MM_PER_UNIT : null
  const offsetMm = aim ? Math.hypot(c.x - aim.x, c.y - aim.y) * MM_PER_UNIT : null
  const edgeMm = mean(placed.map(p => p.edgeMm))
  const rating = scored + bonus(spreadMm, GROUPING_MAX, GROUPING_ZERO_MM) + bonus(edgeMm, CLOSENESS_MAX, CLOSENESS_ZERO_MM)
  const expected = expectedSpreadMm(average, placed.length)
  return {
    darts: placed.length,
    spreadMm,
    offsetMm,
    edgeMm,
    rating,
    expectedSpreadMm: expected,
    comment: groupingComment(spreadMm, expected),
  }
}

/** The aiming sigma (board units, per axis) of a player with this 3-dart average: the bots'
 *  calibration (botLevels.ts), log-linear between levels, clamped outside them. */
function sigmaForAverage(average: number): number {
  const last = LEVEL_AVERAGE.length - 1
  if (average <= LEVEL_AVERAGE[0]) return LEVEL_SIGMA[0]
  if (average >= LEVEL_AVERAGE[last]) return LEVEL_SIGMA[last]
  const i = LEVEL_AVERAGE.findIndex(a => a > average) - 1
  const t = (average - LEVEL_AVERAGE[i]) / (LEVEL_AVERAGE[i + 1] - LEVEL_AVERAGE[i])
  return Math.exp(Math.log(LEVEL_SIGMA[i]) + t * (Math.log(LEVEL_SIGMA[i + 1]) - Math.log(LEVEL_SIGMA[i])))
}

/** The mean distance from their centroid of `n` darts thrown by a player of this average: for a
 *  normal spread of sigma per axis, sigma·√((n−1)/n)·√(π/2) (≈ 1.02 sigma for 3 darts). */
export function expectedSpreadMm(average: number, n: number): number {
  // A level's darts each get a log-normal multiple of its sigma, on average e^(J²/2) ≈ 1.13 wider
  const jitter = Math.exp(SIGMA_JITTER ** 2 / 2)
  return sigmaForAverage(average) * jitter * Math.sqrt((n - 1) / n) * Math.sqrt(Math.PI / 2) * MM_PER_UNIT
}

/** A visit's spread over the one expected for the player's average: Great at or below, Good at
 *  or below, Scattered at or above. */
export const GREAT_GROUP_RATIO = 0.8
export const GOOD_GROUP_RATIO = 1
export const SCATTERED_RATIO = 2

export type GroupingLevel = 'great' | 'good' | 'scattered'
export type GroupingComment = { level: GroupingLevel; text: string }

/** A one-line comment on how tight a visit's group was for the player; null without a
 *  shared-target spread, or when it's neither tight nor scattered enough to be worth saying. */
export function groupingComment(spreadMm: number | null, expectedMm: number): GroupingComment | null {
  if (spreadMm === null) return null
  const r = spreadMm / expectedMm
  if (r <= GREAT_GROUP_RATIO) return { level: 'great', text: 'Great grouping' }
  if (r <= GOOD_GROUP_RATIO) return { level: 'good', text: 'Good grouping' }
  if (r >= SCATTERED_RATIO) return { level: 'scattered', text: 'Scattered' }
  return null
}

/** Worth naming in a grade's text; a smaller bonus still counts in the rating */
const SAY_EDGE_MM = 10

/** "great grouping (6 mm), close to the target (2 mm)": the parts of `g` worth naming; the grouping
 *  only with a Great or Good comment, so the text never praises what the pill calls Scattered */
export function groupingWhy(g: Pick<Grouping, 'spreadMm' | 'edgeMm' | 'comment'>): string {
  const parts: string[] = []
  if (g.spreadMm !== null && (g.comment?.level === 'great' || g.comment?.level === 'good'))
    parts.push(`${g.comment.level === 'great' ? 'great' : 'good'} grouping (${Math.round(g.spreadMm)} mm)`)
  if (g.edgeMm <= SAY_EDGE_MM) parts.push(Math.round(g.edgeMm) === 0 ? 'on target' : `close to the target (${Math.round(g.edgeMm)} mm)`)
  return parts.join(', ')
}
