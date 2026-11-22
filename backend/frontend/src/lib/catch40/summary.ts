// The Catch 40 session summary: one seat's saved detail shaped for the screen, and the standings
// from the final snapshot (what a spectator sees too).
import type { Catch40Detail } from '../api'
import type { Catch40Game, SeatPlace } from '../api/game-ws'

export type Catch40Try = Catch40Detail['seats'][number]['tries'][number]

export type Catch40SummaryData = {
  total: number
  tries: Catch40Try[]
  checkouts: { made: number; of: number }
  avgDarts: number | null
  /** Targets checked out in 2 darts or fewer, 3 darts and 4-6 darts, in that order. */
  byPoints: { points: number; count: number }[]
}

export type Catch40Standing = { name: string; placement: number; total: number }

export function summaryData(detail: Catch40Detail, seat: number): Catch40SummaryData {
  const { tries, total } = detail.seats[seat]
  const made = tries.filter(t => t.finish !== null)
  return {
    total,
    tries,
    checkouts: { made: made.length, of: tries.length },
    avgDarts: made.length ? made.reduce((n, t) => n + t.darts, 0) / made.length : null,
    byPoints: [3, 2, 1, 0].map(points => ({ points, count: tries.filter(t => t.points === points).length })),
  }
}

/** Standings, best first, by the server's places (the final snapshot's `results`). */
export function snapshotStandings(game: Catch40Game, players: { name: string }[], results: SeatPlace[] | null): Catch40Standing[] {
  return game.seats
    .map((s, i) => ({ name: players[i]?.name ?? '', placement: results?.[i]?.placement ?? i + 1, total: s.total }))
    .sort((a, b) => a.placement - b.placement)
}
