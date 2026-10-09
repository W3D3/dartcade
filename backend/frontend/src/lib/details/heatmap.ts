// The heatmap view of the X01 details page: one player's darts across the match, and the
// cards about them. Every dart counts in the cards; only darts with a board position get a dot,
// feed the heat and count for the grouping.
import type { Segment, X01Detail } from '../api'
import { plural } from '../fmt.js'
import { dartLabel } from './x01.js'

/** `manual` mirrors `HistoryDart.source === 'manual'`: a camera dart without `coords` is a
 *  bounce-out, not hand-entered, and must not be reported as one. */
export type HeatDart = { segment: Segment; coords: { x: number; y: number } | null; manual: boolean }

/** Board units (r = 1 at the outer double wire) in mm. */
const MM_PER_UNIT = 170

/** Half-width (mm-equivalent SVG units) of the heat board's viewBox: wide enough that a near
 *  miss up to r ≈ 1.35 (double-wire r = 1) still lands inside it. The SVG, the dots and the
 *  canvas heat mapping all import this one constant, so they can never disagree about where the
 *  visible board ends. */
export const BOARD_VIEW_HALF = 235

/** Clamps a board-px point to the viewBox's rim for drawing only — never call this before
 *  `groupingMm` or any other stat, which must see every dart's real position. */
export function clampToView(p: { x: number; y: number }): { x: number; y: number } {
  const r = Math.hypot(p.x, p.y)
  if (r === 0 || r <= BOARD_VIEW_HALF) return p
  const k = BOARD_VIEW_HALF / r
  return { x: p.x * k, y: p.y * k }
}

const scored = (s: Segment) => s.multiplier > 0
const positioned = (darts: HeatDart[]) => darts.flatMap(d => (d.coords ? [d.coords] : []))

/** `leg` filters to one leg (by its `leg` number, as `X01Detail.legs[].leg`); omitted or `null`
 *  keeps every leg, for the "Match" selection. */
export function seatDarts(detail: X01Detail, seat: number, leg?: number | null): HeatDart[] {
  const legs = leg == null ? detail.legs : detail.legs.filter(l => l.leg === leg)
  return legs.flatMap(l =>
    l.visits
      .filter(v => v.seat === seat)
      .flatMap(v => v.darts.map(x => ({ segment: x.segment, coords: x.coords ?? null, manual: x.source === 'manual' }))),
  )
}

export function inThe20(darts: HeatDart[]) {
  const hits = darts.filter(d => scored(d.segment) && d.segment.number === 20).length
  return { pct: darts.length > 0 ? Math.round((hits / darts.length) * 100) : null, hits, total: darts.length }
}

/** Counts by label in first-seen order. */
function tally(labels: string[]): { label: string; n: number }[] {
  const m = new Map<string, number>()
  for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1)
  return [...m].map(([label, n]) => ({ label, n }))
}
const byCount = (a: { n: number }, b: { n: number }) => b.n - a.n

export function trebles(darts: HeatDart[]): { count: number; top: { label: string; n: number } | null } {
  const t = darts.filter(d => d.segment.multiplier === 3).map(d => dartLabel(d.segment))
  const top = tally(t).sort(byCount)[0] ?? null
  return { count: t.length, top }
}

export function missSide(darts: HeatDart[]): { side: 'Right' | 'Left' | 'Even' | null; right: number; left: number } {
  const n = (nums: number[]) => darts.filter(d => scored(d.segment) && nums.includes(d.segment.number)).length
  const right = n([1, 18]),
    left = n([5, 12])
  const side = right === 0 && left === 0 ? null : right === left ? 'Even' : right > left ? 'Right' : 'Left'
  return { side, right, left }
}

export function groupingMm(darts: HeatDart[]): number | null {
  const pts = positioned(darts)
  if (pts.length < 3) return null
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return (pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length) * MM_PER_UNIT
}

export function mostHit(darts: HeatDart[], n = 5) {
  return tally(darts.filter(d => scored(d.segment)).map(d => dartLabel(d.segment)))
    .sort(byCount)
    .slice(0, n)
}

/** The leg part of the summary line: "Leg 2" for one selected leg, "All 4 legs" / "1 leg" for
 *  the whole match (`leg` null), as `heatSummary` reads it. */
export function heatmapLegLabel(leg: number | null, legCount: number): string {
  if (leg !== null) return `Leg ${leg + 1}`
  return legCount === 1 ? '1 leg' : `All ${legCount} legs`
}

export function heatSummary(name: string, legLabel: string, darts: HeatDart[]): string {
  // No darts for the selection (a forfeit before the first visit, or a leg nobody's reached yet)
  // — "Leg 3 · 0 darts" or "All 0 legs" would read oddly, so say plainly nothing was thrown.
  if (darts.length === 0) return `${name} · No darts thrown`
  // Only hand-entered darts without a board position are "entered by hand, not on the board" —
  // a camera dart with no coords is a bounce-out, not something somebody typed in.
  const byHand = darts.filter(d => d.manual && d.coords === null).length
  return [name, legLabel, plural(darts.length, 'dart'), ...(byHand > 0 ? [`${byHand} entered by hand, not on the board`] : [])].join(' · ')
}

export function boardLabel(name: string, darts: HeatDart[]): string {
  if (darts.length === 0) return `No darts thrown for ${name}`
  const n = positioned(darts).length
  if (n === 0) return `No dart positions for ${name}`
  const top = mostHit(darts, 3).map(h => h.label)
  const spread = groupingMm(darts)
  return [
    `Heatmap of ${n} dart ${n === 1 ? 'position' : 'positions'} for ${name}`,
    ...(top.length > 0 ? [`most hit ${top.join(', ')}`] : []),
    ...(spread === null ? [] : [`average spread ${Math.round(spread)} mm`]),
  ].join('; ')
}

export const toBoardPx = (c: { x: number; y: number }) => ({ x: MM_PER_UNIT * c.x, y: -MM_PER_UNIT * c.y })
