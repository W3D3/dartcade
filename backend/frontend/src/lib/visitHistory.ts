import type { AtcGame, X01Game } from './api/game-ws'

// Finished visits per player, rebuilt in the browser from game snapshots.
// It only knows what happened since the page loaded.

/** X01: points scored and points left. ATC: targets advanced (`left` is 0). */
export type Visit = { scored: number; left: number; darts: number; bust: boolean }

export type VisitHistory = {
  /** Per player: visits of the current leg. */
  leg: Visit[][]
  /** Per player: every visit of the match, for averages. */
  all: Visit[][]
  /** Per player: score (X01) or progress (ATC) when their current visit began; null when unknown. */
  start: (number | null)[]
  prev: { totalVisits: number[]; totalDarts: number[]; legs: number[]; darts: number; bust: boolean; cp: number } | null
}

export const emptyHistory = (): VisitHistory => ({ leg: [], all: [], start: [], prev: null })

/** Fold one snapshot's game state into the history. A visit is finished when totalVisits goes up. */
export function trackVisits(h: VisitHistory, game: X01Game | AtcGame): VisitHistory {
  const isX01 = 'scores' in game
  const progress = isX01 ? game.scores : game.hitCounts
  const { totalVisits, totalDarts } = game
  const legs = isX01 ? game.legs : []
  const bust = isX01 && game.bustThisVisit
  const darts = game.currentVisitDarts.length
  const cp = game.currentPlayer
  const n = Math.max(totalVisits.length, progress.length)

  let leg = Array.from({ length: n }, (_, i) => h.leg[i] ?? [])
  const all = Array.from({ length: n }, (_, i) => h.all[i] ?? [])
  const start = Array.from({ length: n }, (_, i) => h.start[i] ?? null)

  const p = h.prev
  if (p) {
    const finished = totalVisits.flatMap((t, i) => (t > (p.totalVisits[i] ?? 0) ? [i] : []))
    const added = finished.reduce((a, i) => a + totalVisits[i] - (p.totalVisits[i] ?? 0), 0)
    const legOver = legs.some((l, i) => l > (p.legs.at(i) ?? 0))
    if (added === 1 && finished[0] === p.cp) {
      const i = p.cp
      const wonLeg = (legs.at(i) ?? 0) > (p.legs.at(i) ?? 0)
      const s = start[i]
      const now = progress.at(i) ?? s
      if (s !== null && now !== null) { // null: began before the page loaded
        // Darts seen so far plus any the server counted since (missed snapshots, an empty turn's misses)
        const darts = Math.max(0, p.darts + (totalDarts.at(i) ?? 0) - (p.totalDarts.at(i) ?? 0))
        const visit: Visit = isX01
          ? { scored: wonLeg ? s : s - now, left: wonLeg ? 0 : now, darts, bust: p.bust }
          : { scored: now - s, left: 0, darts, bust: false }
        if (visit.scored >= 0) {
          leg[i] = [...leg[i], visit]
          all[i] = [...all[i], visit]
        }
      }
      start[i] = null
    } else if (added > 0) {
      // Snapshots were missed (reconnect, restart): what happened in between is unknown
      start.fill(null)
    }
    if (legOver) leg = leg.map(() => [])
  }

  // A visit (re)starts whenever the thrower has no darts on the board
  if (darts === 0 && cp < n) start[cp] = progress.at(cp) ?? null

  return {
    leg, all, start,
    prev: { totalVisits: [...totalVisits], totalDarts: [...totalDarts], legs: [...legs], darts, bust, cp },
  }
}

/** Points per dart times three over the given visits, or null without darts. */
export function threeDartAvg(visits: Visit[]): number | null {
  const darts = visits.reduce((a, v) => a + v.darts, 0)
  if (darts === 0) return null
  return (visits.reduce((a, v) => a + v.scored, 0) / darts) * 3
}
