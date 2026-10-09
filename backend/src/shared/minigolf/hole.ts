// Checks a hole before it's played: readable errors instead of a broken simulation.
import { pointInPolygon, segmentsIntersect } from './geometry.js'
import type { Hole, Pt } from './types.js'

const finite = (pts: readonly Pt[]) => pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))

function crossesItself(poly: readonly Pt[]): boolean {
  const n = poly.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // neighbours through the closing edge
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true
    }
  }
  return false
}

function checkPolygon(errors: string[], label: string, poly: readonly Pt[]): void {
  if (poly.length < 3) errors.push(`${label} needs at least 3 points`)
  else if (!finite(poly)) errors.push(`${label} has a non-finite number`)
  else if (crossesItself(poly)) errors.push(`${label} crosses itself`)
}

/** Everything wrong with the hole; empty when it can be played. */
export function validateHole(hole: Hole): string[] {
  const errors: string[] = []
  checkPolygon(errors, 'outline', hole.outline)
  const outlineOk = errors.length === 0
  if (!finite([hole.tee])) errors.push('tee has a non-finite number')
  else if (outlineOk && !pointInPolygon(hole.tee, hole.outline)) errors.push('tee is outside the outline')
  if (!finite([hole.cup.at])) errors.push('cup has a non-finite number')
  else if (outlineOk && !pointInPolygon(hole.cup.at, hole.outline)) errors.push('cup is outside the outline')
  if (!(hole.cup.r > 0)) errors.push('cup radius must be positive')
  if (!(hole.par >= 1)) errors.push('par must be at least 1')
  hole.walls.forEach((w, i) => {
    if (w.points.length < 2) errors.push(`wall ${i + 1} needs at least 2 points`)
    else if (!finite(w.points)) errors.push(`wall ${i + 1} has a non-finite number`)
  })
  hole.bumpers.forEach((b, i) => {
    if (!finite([b.at])) errors.push(`bumper ${i + 1} has a non-finite number`)
    if (!(b.r > 0)) errors.push(`bumper ${i + 1} radius must be positive`)
  })
  hole.slopes.forEach((s, i) => checkPolygon(errors, `slope ${i + 1}`, s.area))
  return errors
}
