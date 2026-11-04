// The admin Coach sandbox's (#/admin/coach) darts: typed by label or placed by a click. The coach
// reviews them with $shared/coach/openVisit.
import { segmentAt } from '$shared/board'
import type { CoachDart } from '$shared/coach/walk'

const LABEL = /^(?:([SDT])([1-9]|1\d|20)|(BULL)|(25)|(MISS))$/

/** A typed dart (S20, T19, D16, Bull, 25, Miss; any case), without a position; null when it isn't one. */
export function dartFromLabel(raw: string): CoachDart | null {
  const m = LABEL.exec(raw.trim().toUpperCase())
  if (!m) return null
  if (m[3]) return { segment: { name: 'Bull', number: 50, multiplier: 1 }, coords: null }
  if (m[4]) return { segment: { name: '25', number: 25, multiplier: 1 }, coords: null }
  if (m[5]) return { segment: { name: 'Miss', number: 0, multiplier: 0 }, coords: null }
  const multiplier = m[1] === 'S' ? 1 : m[1] === 'D' ? 2 : 3
  return { segment: { name: `${m[1]}${m[2]}`, number: Number(m[2]), multiplier }, coords: null }
}

/** A dart where the board was clicked (board units, y up). */
export function dartAt(p: { x: number; y: number }): CoachDart {
  const { name, number, multiplier } = segmentAt(p.x, p.y)
  return { segment: { name, number, multiplier }, coords: p }
}
