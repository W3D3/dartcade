// SVG path data for a plain dartboard in the heatmap's viewBox (-200..200, 1 unit = 1 mm,
// double wire at 170): 20 segments × 4 rings and the numbers around it.
import { HALF, R, SEGS, segAngle } from '$shared/board.js'

const MM = 170
const pt = (r: number, a: number) => `${(MM * r * Math.cos(a)).toFixed(2)} ${(-MM * r * Math.sin(a)).toFixed(2)}`

function sector(r0: number, r1: number, a0: number, a1: number): string {
  // Board angles are y-up; in SVG (y down) a point at angle a maps to (cos a, -sin a), so the
  // outer edge (r1) swept from a0 to a1 and back along the inner edge (r0) from a1 to a0 traces
  // the sector's boundary without crossing itself only if both arcs are the *minor* arc (span
  // HALF*2 < 180°, so large-arc-flag is always 0) of the circle centred on the origin — not the
  // mirror-image minor arc of a circle on the other side of the chord, which the other sweep
  // value would trace instead. Working the standard arc-to-centre conversion through confirms
  // sweep 0 for the outer (a0 → a1) and sweep 1 for the inner (a1 → a0) both centre on the
  // origin; the opposite sweep on either arc would bow back toward the centre instead.
  return `M${pt(r1, a0)} A${MM * r1} ${MM * r1} 0 0 0 ${pt(r1, a1)} L${pt(r0, a1)} A${MM * r0} ${MM * r0} 0 0 1 ${pt(r0, a0)} Z`
}

const RINGS = [
  { ring: 'single', r0: R.bull25, r1: R.si },
  { ring: 'treble', r0: R.si, r1: R.tr },
  { ring: 'single', r0: R.tr, r1: R.so },
  { ring: 'double', r0: R.so, r1: R.db },
] as const

export function boardSegments(): { d: string; ring: 'single' | 'treble' | 'double'; odd: boolean }[] {
  return SEGS.flatMap((_, i) =>
    RINGS.map(r => ({ d: sector(r.r0, r.r1, segAngle(i) - HALF, segAngle(i) + HALF), ring: r.ring, odd: i % 2 === 1 })),
  )
}

export function boardNumbers(): { n: number; x: number; y: number }[] {
  return SEGS.map((n, i) => ({ n, x: 184 * Math.cos(segAngle(i)), y: -184 * Math.sin(segAngle(i)) }))
}
