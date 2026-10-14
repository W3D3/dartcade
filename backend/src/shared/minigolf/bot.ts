// The editor's putting bot ("Test the hole"): plays a hole with the real 3D physics to tell whether
// the cup can be reached, and in how many strokes. Greedy: each stroke tries 16 putts and plays the
// one that ends nearest the cup along the felt, with a little noise in aim and strength.
// Spec: docs/superpowers/specs/2026-10-14-minigolf-course-editor-design.md ("Checks")
import { seededRng } from '../rng.js'
import { simulateShot3d } from './3d/physics3d.js'
import { bounds, distanceToSegment, edgesOf, lineClear, pointInPolygon } from './geometry.js'
import { DEFAULT_PHYSICS, type Physics } from './physics.js'
import type { Hole, Pt, Shot } from './types.js'

/** The distance from a point to the cup along the felt, around rails, walls and bumpers (a grid of
 *  `cell` mm flood-filled from the cup), Infinity off the felt or where the cup can't be reached. */
export function distanceField(hole: Hole, cell = 50): (p: Pt) => number {
  const { minX, minY, maxX, maxY } = bounds(hole.outline)
  const nx = Math.ceil((maxX - minX) / cell)
  const ny = Math.ceil((maxY - minY) / cell)
  const centre = (i: number, j: number): Pt => [minX + (i + 0.5) * cell, minY + (j + 0.5) * cell]
  const cellOf = ([x, y]: Pt) => [Math.floor((x - minX) / cell), Math.floor((y - minY) / cell)]
  const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny
  const felt = Array.from({ length: nx * ny }, (_, k) => pointInPolygon(centre(k % nx, Math.floor(k / nx)), hole.outline))
  const dist = new Float64Array(nx * ny).fill(Infinity)
  const STEPS = [-1, 0, 1].flatMap(di => [-1, 0, 1].map(dj => [di, dj])).filter(([di, dj]) => di || dj)
  // Rails and walls with their half thickness: lineClear lets a line through a corner it only touches
  const rails = [{ points: hole.outline, closed: true }, ...hole.walls].flatMap(w => {
    const half = (w.thickness ?? DEFAULT_PHYSICS.wallThickness) / 2
    return edgesOf(w.points, !!w.closed).map(([a, b]) => ({ a, b, half }))
  })
  const clear = (p: Pt, q: Pt) =>
    lineClear(hole, p, q) && rails.every(({ a, b, half }) => Math.min(distanceToSegment(a, p, q), distanceToSegment(b, p, q)) >= half)

  /** The cells around p (its own and the 8 next to it) a ball can roll to from p in a straight line. */
  const around = (p: Pt) => {
    const [i, j] = cellOf(p)
    return [[0, 0], ...STEPS]
      .map(([di, dj]) => [i + di, j + dj])
      .filter(([a, b]) => inGrid(a, b) && felt[b * nx + a] && clear(p, centre(a, b)))
  }
  for (const [i, j] of around(hole.cup.at)) {
    const c = centre(i, j)
    dist[j * nx + i] = Math.hypot(c[0] - hole.cup.at[0], c[1] - hole.cup.at[1])
  }

  // Which of its 8 steps each cell may take (no rail, wall or bumper in the way), worked out once
  const open = felt.map((f, k) => {
    const [i, j] = [k % nx, Math.floor(k / nx)]
    return STEPS.map(([di, dj]) => f && inGrid(i + di, j + dj) && felt[k + dj * nx + di] && clear(centre(i, j), centre(i + di, j + dj)))
  })
  // Relax until nothing changes, sweeping forwards and backwards so distances spread both ways
  for (let changed = true, pass = 0; changed; pass++) {
    changed = false
    for (let n = 0; n < nx * ny; n++) {
      const k = pass % 2 ? nx * ny - 1 - n : n
      STEPS.forEach(([di, dj], s) => {
        if (!open[k][s]) return
        const d = dist[k + dj * nx + di] + cell * Math.hypot(di, dj)
        if (d < dist[k]) {
          dist[k] = d
          changed = true
        }
      })
    }
  }

  return p => {
    if (!pointInPolygon(p, hole.outline)) return Infinity
    let best = Infinity
    for (const [i, j] of around(p)) {
      const c = centre(i, j)
      best = Math.min(best, dist[j * nx + i] + Math.hypot(c[0] - p[0], c[1] - p[1]))
    }
    return best
  }
}

export interface BotResult {
  /** Rounds that reached the cup within maxStrokes. */
  reached: number
  rounds: number
  /** Strokes per round; maxStrokes for a round that didn't reach the cup. */
  strokes: number[]
  suggestedPar: number
}

const DIRECTIONS: Pt[] = Array.from({ length: 8 }, (_, k) => [Math.sin((k * Math.PI) / 4), -Math.cos((k * Math.PI) / 4)])
const POWERS = [0.45, 0.8]
const AIM_NOISE = (3 * Math.PI) / 180
const POWER_NOISE = 0.08

/** Plays `rounds` rounds of the hole from the tee, seeded: the same hole and seed, the same result. */
export function testHole(
  hole: Hole,
  physics: Physics,
  opts: { rounds: number; seed: number; maxStrokes: number; onRound?: (done: number) => void },
): BotResult {
  const rng = seededRng(opts.seed)
  const field = distanceField(hole)
  // Every round starts at the tee: its best putt is the same each time
  const bestFrom = new Map<string, Shot>()
  const best = (at: Pt): Shot => {
    const key = `${at[0]},${at[1]}`
    const known = bestFrom.get(key)
    if (known) return known
    let shot: Shot = { dir: DIRECTIONS[0], power: POWERS[0] }
    let score = Infinity
    for (const dir of DIRECTIONS) {
      for (const power of POWERS) {
        const r = simulateShot3d(hole, physics, at, { dir, power })
        const s = r.holed ? -1 : field(r.rest)
        if (s < score) [shot, score] = [{ dir, power }, s]
      }
    }
    bestFrom.set(key, shot)
    return shot
  }

  const strokes: number[] = []
  let reached = 0
  for (let round = 0; round < opts.rounds; round++) {
    // Out of bounds needs nothing here: simulateShot3d puts the ball back where it was hit, as in the game
    let at = hole.tee
    let n = opts.maxStrokes
    for (let stroke = 1; stroke <= opts.maxStrokes; stroke++) {
      const { dir, power } = best(at)
      const a = (rng() * 2 - 1) * AIM_NOISE
      const [c, s] = [Math.cos(a), Math.sin(a)]
      const r = simulateShot3d(hole, physics, at, {
        dir: [dir[0] * c - dir[1] * s, dir[0] * s + dir[1] * c],
        power: Math.min(1, power * (1 + (rng() * 2 - 1) * POWER_NOISE)),
      })
      if (r.holed) {
        n = stroke
        reached++
        break
      }
      at = r.rest
    }
    strokes.push(n)
    opts.onRound?.(round + 1)
  }

  // The median over all rounds, a miss counting as maxStrokes; never below 2
  const sorted = [...strokes].sort((a, b) => a - b)
  const mid = sorted.length / 2
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  return { reached, rounds: opts.rounds, strokes, suggestedPar: Math.max(2, median) }
}
