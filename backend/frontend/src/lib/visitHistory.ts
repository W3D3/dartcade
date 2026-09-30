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

const nums = (game: Record<string, unknown>, key: string): number[] =>
  Array.isArray(game[key]) ? (game[key] as number[]) : []

/** Fold one snapshot's game state into the history. A visit is finished when totalVisits goes up. */
export function trackVisits(h: VisitHistory, game: Record<string, unknown>): VisitHistory {
  const isX01 = Array.isArray(game.scores)
  const progress = isX01 ? nums(game, 'scores') : nums(game, 'hitCounts')
  const totalVisits = nums(game, 'totalVisits')
  const legs = nums(game, 'legs')
  const totalDarts = nums(game, 'totalDarts')
  const darts = Array.isArray(game.currentVisitDarts) ? game.currentVisitDarts.length : 0
  const cp = typeof game.currentPlayer === 'number' ? game.currentPlayer : 0
  const n = Math.max(totalVisits.length, progress.length)

  let leg = Array.from({ length: n }, (_, i) => h.leg[i] ?? [])
  const all = Array.from({ length: n }, (_, i) => h.all[i] ?? [])
  const start = Array.from({ length: n }, (_, i) => h.start[i] ?? null)

  const p = h.prev
  if (p) {
    const finished = totalVisits.flatMap((t, i) => (t > (p.totalVisits[i] ?? 0) ? [i] : []))
    const added = finished.reduce((a, i) => a + totalVisits[i] - (p.totalVisits[i] ?? 0), 0)
    const legOver = legs.some((l, i) => l > (p.legs[i] ?? 0))
    if (added === 1 && finished[0] === p.cp) {
      const i = p.cp
      const wonLeg = (legs[i] ?? 0) > (p.legs[i] ?? 0)
      const s = start[i]
      const now = progress[i] ?? s
      if (s !== null && now !== null) { // null: began before the page loaded
        // The server's dart count also covers darts added at takeout (an empty turn's misses)
        const dartsAdded = (totalDarts[i] ?? 0) - (p.totalDarts[i] ?? 0)
        const darts = dartsAdded > 0 ? dartsAdded : p.darts
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
  if (darts === 0 && cp < n) start[cp] = progress[cp] ?? null

  return {
    leg, all, start,
    prev: { totalVisits: [...totalVisits], totalDarts: [...totalDarts], legs: [...legs], darts, bust: game.bustThisVisit === true, cp },
  }
}

/** Points per dart times three over the given visits, or null without darts. */
export function threeDartAvg(visits: Visit[]): number | null {
  const darts = visits.reduce((a, v) => a + v.darts, 0)
  if (darts === 0) return null
  return (visits.reduce((a, v) => a + v.scored, 0) / darts) * 3
}
