// How slopes look, drawn from what the physics does (shared/minigolf/simulate.ts): a hill or bowl
// pushes within a circle round its centre, a bump within a band round its ridge. Both are the
// same shape, a capsule (a circle is a ridge with both ends at one point), so both are shaded as
// stacked translucent capsules, strongest at the top and fading out at the edge, with contour
// lines at regular heights.
import type { Pt, Slope } from '$shared/minigolf/types'

/** Contour spacing (mm): closer on steeper slopes, like a map. */
export function contourSpacing(strength: number): number {
  return Math.min(400, Math.max(80, 250_000 / Math.max(1, Math.abs(strength))))
}

/** How many capsules make up the shading: enough that the steps don't show. */
const BANDS = 12

const n = (v: number) => String(Math.round(v * 10) / 10 || 0)
const at = (p: Pt) => `${n(p[0])} ${n(p[1])}`

/** An SVG path round the points within d of the segment ab: a circle when a and b are one point. */
export function capsule(a: Pt, b: Pt, d: number): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const arc = `A ${n(d)} ${n(d)} 0`
  if (len === 0) return `M ${at([a[0] - d, a[1]])} ${arc} 1 0 ${at([a[0] + d, a[1]])} ${arc} 1 0 ${at([a[0] - d, a[1]])} Z`
  // Sideways from the ridge, a quarter turn from its direction
  const side: Pt = [((b[1] - a[1]) / len) * d, (-(b[0] - a[0]) / len) * d]
  const plus = (p: Pt): Pt => [p[0] + side[0], p[1] + side[1]]
  const minus = (p: Pt): Pt => [p[0] - side[0], p[1] - side[1]]
  return `M ${at(plus(a))} L ${at(plus(b))} ${arc} 0 1 ${at(minus(b))} L ${at(minus(a))} ${arc} 0 1 ${at(plus(a))} Z`
}

export type SlopeLook = {
  /** Higher in the middle (a hill or a bump: shaded light); false for a bowl (shaded dark). */
  raised: boolean
  /** The shading, widest (the whole slope) first. */
  bands: string[]
  contours: string[]
}

export function slopeLook(s: Slope): SlopeLook {
  const { from, to, reach, strength } =
    'radial' in s
      ? { from: s.radial.center, to: s.radial.center, reach: s.radial.radius, strength: s.radial.strength }
      : { ...s.bump, reach: s.bump.width }
  // At least one line on even the gentlest slope, halfway up
  const step = Math.min(contourSpacing(strength), reach / 2)
  const contours: string[] = []
  for (let d = step; d < reach; d += step) contours.push(capsule(from, to, d))
  const bands = Array.from({ length: BANDS }, (_, k) => capsule(from, to, (reach * (BANDS - k)) / BANDS))
  return { raised: strength > 0, bands, contours }
}
