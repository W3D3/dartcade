// How a visit's darts sat together: their spread around their middle, how far that middle is from
// their shared target and how close they came to their targets' beds; and the visit's rating, its
// score plus a bonus for each. Only darts the camera placed count: a typed dart has no position.
import { AIMS } from './aims.js'
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
}

type Placed = { coords: { x: number; y: number } | null; class: Pick<DartClass, 'target' | 'edgeMm'> }

/** A bonus of `max` at 0 mm, falling linearly to 0 at `zero` mm; 0 without a value */
const bonus = (mm: number | null, max: number, zero: number) => (mm === null ? 0 : max * Math.max(0, 1 - mm / zero))

/** The visit's grouping from its walked darts (those after a bust left out) and its score; null
 *  with fewer than 2 placed darts, the rating then being the score. */
export function grouping(darts: readonly Placed[], scored: number): Grouping | null {
  const placed = darts.flatMap(d =>
    d.coords && d.class.target && d.class.edgeMm !== null ? [{ ...d.coords, aimId: d.class.target.aimId, edgeMm: d.class.edgeMm }] : [],
  )
  if (placed.length < 2) return null
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const c = { x: mean(placed.map(p => p.x)), y: mean(placed.map(p => p.y)) }
  const aim = placed.every(p => p.aimId === placed[0].aimId) ? AIMS.find(a => a.id === placed[0].aimId) : undefined
  const spreadMm = aim ? mean(placed.map(p => Math.hypot(p.x - c.x, p.y - c.y))) * MM_PER_UNIT : null
  const offsetMm = aim ? Math.hypot(c.x - aim.x, c.y - aim.y) * MM_PER_UNIT : null
  const edgeMm = mean(placed.map(p => p.edgeMm))
  const rating = scored + bonus(spreadMm, GROUPING_MAX, GROUPING_ZERO_MM) + bonus(edgeMm, CLOSENESS_MAX, CLOSENESS_ZERO_MM)
  return { darts: placed.length, spreadMm, offsetMm, edgeMm, rating }
}

/** Worth naming in a grade's text; a smaller bonus still counts in the rating */
const SAY_SPREAD_MM = 15
const SAY_EDGE_MM = 10

/** "tight group (6 mm), close to the target (2 mm)": the parts of `g` worth naming */
export function groupingWhy(g: Pick<Grouping, 'spreadMm' | 'edgeMm'>): string {
  const parts: string[] = []
  if (g.spreadMm !== null && g.spreadMm <= SAY_SPREAD_MM) parts.push(`tight group (${Math.round(g.spreadMm)} mm)`)
  if (g.edgeMm <= SAY_EDGE_MM) parts.push(Math.round(g.edgeMm) === 0 ? 'on target' : `close to the target (${Math.round(g.edgeMm)} mm)`)
  return parts.join(', ')
}
