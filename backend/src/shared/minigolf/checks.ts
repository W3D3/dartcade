// Checks the editor shows live and Publish enforces: errors block, warnings are advice.
import { distanceToSegment, edgesOf, pointInPolygon } from './geometry.js'
import { validateHole } from './hole.js'
import { BALL_R, type Hole, type Pt } from './types.js'

/** `outline` addresses a corner, `edge` the edge from that corner to the next (the editor selects it to curve it). */
export type ElementRef = { kind: 'outline' | 'edge' | 'tee' | 'cup' | 'bumper' | 'wall' | 'slope' | 'terrain' | 'circle'; index: number }

export type Check = { level: 'error' | 'warning'; message: string; element?: ElementRef }

/** How close is too close: a ball's diameter. */
const RAIL_GAP = BALL_R * 2

function elementFor(message: string): ElementRef | undefined {
  if (message.startsWith('outline')) return { kind: 'outline', index: 0 }
  if (message.startsWith('tee')) return { kind: 'tee', index: 0 }
  if (message.startsWith('cup')) return { kind: 'cup', index: 0 }
  const m = /^(\w+) (\d+)/.exec(message)
  const kind = (['wall', 'bumper', 'slope', 'terrain', 'circle'] as const).find(k => k === m?.[1])
  return m && kind ? { kind, index: Number(m[2]) - 1 } : undefined
}

/** The distance from p to the nearest edge of a polyline/polygon; Infinity for an empty one. */
function distanceToPoly(p: Pt, points: readonly Pt[], closed: boolean): number {
  const edges = edgesOf(points, closed)
  return edges.length === 0 ? Infinity : Math.min(...edges.map(([a, b]) => distanceToSegment(p, a, b)))
}

/** 32 points round c, out to [left, top, right, bottom] (an ellipse's quarters); 1 mm short,
 *  since the ground is flat again at its reach. */
function around(c: Pt, [left, top, right, bottom]: readonly number[]): Pt[] {
  return Array.from({ length: 32 }, (_, k) => {
    const [cos, sin] = [Math.cos((k / 32) * 2 * Math.PI), Math.sin((k / 32) * 2 * Math.PI)]
    return [c[0] + cos * Math.max(0, (cos < 0 ? left : right) - 1), c[1] + sin * Math.max(0, (sin < 0 ? top : bottom) - 1)]
  })
}

export function holeChecks(hole: Hole): Check[] {
  const checks: Check[] = validateHole(hole).map(message => {
    const element = elementFor(message)
    return element ? { level: 'error', message, element } : { level: 'error', message }
  })

  const distanceToOutline = (p: Pt) => distanceToPoly(p, hole.outline, true)

  if (distanceToOutline(hole.cup.at) < RAIL_GAP) {
    checks.push({ level: 'warning', message: 'Cup is close to the rail', element: { kind: 'cup', index: 0 } })
  }

  const cupNearWall = hole.walls.some(w => distanceToPoly(hole.cup.at, w.points, !!w.closed) < RAIL_GAP)
  if (cupNearWall) checks.push({ level: 'warning', message: 'Cup is close to a wall', element: { kind: 'cup', index: 0 } })

  hole.bumpers.forEach((b, i) => {
    if (distanceToOutline(b.at) - b.r < RAIL_GAP) {
      checks.push({ level: 'warning', message: 'Bumper is close to the rail', element: { kind: 'bumper', index: i } })
    }
  })

  const onAWall = hole.walls.some(w => distanceToPoly(hole.tee, w.points, !!w.closed) < BALL_R)
  if (onAWall) checks.push({ level: 'warning', message: 'Tee is on a wall', element: { kind: 'tee', index: 0 } })

  // Each shape's reach, where its ground stops: past the outline, it would lift the rail
  const reachPast = (points: Pt[]) => points.some(p => !pointInPolygon(p, hole.outline))
  hole.slopes.forEach((s, i) => {
    const w = 'radial' in s ? s.radial.radius : s.bump.width
    const centres = 'radial' in s ? [s.radial.center] : [s.bump.from, s.bump.to]
    if (reachPast(centres.flatMap(c => around(c, [w, w, w, w])))) {
      checks.push({ level: 'warning', message: 'Terrain reaches past the outline', element: { kind: 'slope', index: i } })
    }
  })

  ;(hole.terrain ?? []).forEach(({ mesa }, i) => {
    const corners: Pt[] = [mesa.from, [mesa.to[0], mesa.from[1]], mesa.to, [mesa.from[0], mesa.to[1]]]
    // A corner's ramps reach out by the edge widths (3d/ground.ts's heightAt); inward, they stay on the mesa
    if (reachPast(corners.flatMap(c => around(c, mesa.edges)))) {
      checks.push({ level: 'warning', message: 'Terrain reaches past the outline', element: { kind: 'terrain', index: i } })
    }
  })

  return checks
}
