// Execution: how the darts went where they were meant to. Scoring average until 170, busts and
// doubles.
import { directOutId } from './aims.js'
import { dartPoints, type Throw } from './walk.js'
import { perVisitAverage } from '../darts.js'

export type DoubleStat = { target: string; darts: number; hits: number }
export type CoachStats = {
  /** 3-dart average of the darts thrown with more than 170 left; null without any */
  scoringAverage: number | null
  scoringDarts: number
  /** Visits that busted */
  busts: number
  /** Most darts first */
  doubles: DoubleStat[]
  checkouts: number
  dartsAtDouble: number
}

/** A seat's execution stats from its darts (walk.ts throwsOf). */
export function executionStats(throws: readonly Throw[]): CoachStats {
  const scoring = throws.filter(t => t.left > 170)
  const points = scoring.reduce((s, t) => s + dartPoints(t.d), 0)
  const doubles = new Map<string, DoubleStat>()
  for (const t of throws) {
    const target = directOutId(t.left)
    if (!target) continue
    const s = doubles.get(target) ?? { target, darts: 0, hits: 0 }
    s.darts++
    if (t.checkout) s.hits++
    doubles.set(target, s)
  }
  const list = [...doubles.values()].sort((a, b) => b.darts - a.darts)
  return {
    scoringAverage: perVisitAverage(points, scoring.length),
    scoringDarts: scoring.length,
    busts: throws.filter(t => t.bust).length,
    doubles: list,
    checkouts: throws.filter(t => t.checkout).length,
    dartsAtDouble: list.reduce((s, d) => s + d.darts, 0),
  }
}
