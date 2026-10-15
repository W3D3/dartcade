// Checks a hole before it's played: readable errors instead of a broken simulation.
import { pointInPolygon, segmentsIntersect } from './geometry.js'
import type { Hole, Pt } from './types.js'

const finite = (pts: readonly Pt[]) => pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))

export function crossesItself(poly: readonly Pt[]): boolean {
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
  if (hole.shape) {
    const { corners, curves, circles } = hole.shape
    if (curves.length !== corners.length) errors.push('shape curves must match its corners')
    corners.forEach((p, i) => {
      if (!finite([p])) errors.push(`shape corner ${i + 1} must have finite numbers`)
    })
    curves.forEach((c, i) => {
      if (c && !finite([c.c1, c.c2])) errors.push(`curve ${i + 1} must have finite numbers`)
    })
    circles.forEach((c, i) => {
      if (!finite([c.center]) || !Number.isFinite(c.r)) errors.push(`circle ${i + 1} must have finite numbers`)
      if (!(c.r > 0)) errors.push(`circle ${i + 1} radius must be positive`)
    })
  }
  hole.walls.forEach((w, i) => {
    if (w.points.length < 2) errors.push(`wall ${i + 1} needs at least 2 points`)
    else if (!finite(w.points)) errors.push(`wall ${i + 1} has a non-finite number`)
    else if (w.thickness !== undefined && !(w.thickness > 0)) errors.push(`wall ${i + 1} thickness must be positive`)
  })
  hole.bumpers.forEach((b, i) => {
    if (!finite([b.at])) errors.push(`bumper ${i + 1} has a non-finite number`)
    if (!(b.r > 0)) errors.push(`bumper ${i + 1} radius must be positive`)
  })
  hole.slopes.forEach((s, i) => {
    const name = `slope ${i + 1}`
    if ('radial' in s) {
      const { center, radius, strength } = s.radial
      if (!finite([center, [radius, strength]])) errors.push(`${name} has a non-finite number`)
      else if (!(radius > 0)) errors.push(`${name} radius must be positive`)
    } else {
      const { from, to, width, strength } = s.bump
      if (!finite([from, to, [width, strength]])) errors.push(`${name} has a non-finite number`)
      else if (from[0] === to[0] && from[1] === to[1]) errors.push(`${name} ridge needs two different ends`)
      else if (!(width > 0)) errors.push(`${name} width must be positive`)
    }
  })
  ;(hole.terrain ?? []).forEach(({ mesa }, i) => {
    const name = `terrain ${i + 1}`
    if (!finite([mesa.from, mesa.to, [mesa.height, 0], [mesa.edges[0], mesa.edges[1]], [mesa.edges[2], mesa.edges[3]]]))
      errors.push(`${name} has a non-finite number`)
    else if (mesa.from[0] === mesa.to[0] || mesa.from[1] === mesa.to[1]) errors.push(`${name} needs an area`)
    else if (!mesa.edges.every(e => e > 0)) errors.push(`${name} edges must be positive`)
  })
  return errors
}
