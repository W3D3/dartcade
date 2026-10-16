// The 121 session summary (P121-Summary): one seat's saved detail shaped for the screen, the
// best-run line, and the standings when only the snapshot is there (a spectator).
import type { P121Detail } from '../api'
import type { P121Game } from '../api/game-ws'
import { plural } from '../fmt.js'
import { rank } from '../winScreen.js'

export type P121SummaryData = {
  reached: number
  bestRun: { length: number; from: number; to: number } | null
  checkouts: { made: number; tries: number; pct: number }
  highestMade: number | null
  avgDarts: number | null
  fastest: { darts: number; target: number } | null
  tries: { target: number; made: boolean }[]
  doubles: { label: string; hits: number; attempts: number }[]
  dartsPerCheckout: { darts: number; count: number }[]
}

export type P121Standing = { name: string; placement: number; highestMade: number | null }

export function summaryData(detail: P121Detail, seat: number): P121SummaryData {
  const s = detail.seats[seat]
  const made = s.tries.filter(t => t.made)
  const most = Math.max(0, ...s.dartsPerCheckout.map(d => d.darts))
  // Above 120 a checkout takes 3 darts at least; 81 and 101 can go out in 2 (or 1, straight out)
  const fewest = Math.min(3, ...s.dartsPerCheckout.map(d => d.darts))
  return {
    reached: s.highestReached,
    bestRun: s.bestRun,
    checkouts: { made: made.length, tries: s.tries.length, pct: s.tries.length ? Math.round((made.length / s.tries.length) * 100) : 0 },
    highestMade: made.length ? Math.max(...made.map(t => t.target)) : null,
    avgDarts: made.length ? made.reduce((n, t) => n + t.darts, 0) / made.length : null,
    fastest: s.fastest,
    tries: s.tries.map(t => ({ target: t.target, made: t.made })),
    doubles: s.doubles,
    dartsPerCheckout: Array.from({ length: Math.max(0, most - fewest + 1) }, (_, i) => ({
      darts: fewest + i,
      count: s.dartsPerCheckout.find(d => d.darts === fewest + i)?.count ?? 0,
    })),
  }
}

const MISS = {
  reset: (start: number) => `a miss sends you back to ${start}`,
  down: () => 'a miss drops you one',
  stay: () => 'a miss keeps the target',
}

/** "Best run: 4 checkouts in a row, 121 → 124 · a miss sends you back to 121". */
export function bestRunLine(d: P121SummaryData, missRule: 'reset' | 'down' | 'stay', startTarget: number): string {
  const miss = MISS[missRule](startTarget)
  const r = d.bestRun
  if (!r) return `No checkouts this time · ${miss}`
  if (r.length === 1) return `Best run: 1 checkout, ${r.from} · ${miss}`
  return `Best run: ${plural(r.length, 'checkout')} in a row, ${r.from} → ${r.to} · ${miss}`
}

/** Standings, best first. The saved game's placements once it loads (they know who forfeited);
 *  until then ranked from the snapshot like the server: the winner, then highest made, more
 *  checkouts, fewer darts, and seats that gave up share last place. */
export function snapshotStandings(
  game: P121Game,
  players: { name: string }[],
  forfeited: boolean[],
  saved: { seat: number; placement: number }[] | null = null,
): P121Standing[] {
  const key = game.seats.map(s => {
    const made = s.tries.filter(t => t.made)
    return { high: s.highestMade ?? 0, made: made.length, darts: made.reduce((n, t) => n + t.darts, 0) }
  })
  const out = (i: number) => (forfeited[i] ? 1 : 0)
  const ranked = rank(
    game.seats.length,
    game.winner,
    (a, b) => out(a) - out(b) || key[b].high - key[a].high || key[b].made - key[a].made || key[a].darts - key[b].darts,
  )
  const live = game.seats.length - forfeited.filter(Boolean).length
  const placeOf = (i: number) => saved?.find(p => p.seat === i)?.placement ?? (forfeited[i] ? live + 1 : ranked[i])
  return game.seats
    .map((s, i) => ({ name: players[i]?.name ?? '', placement: placeOf(i), highestMade: s.highestMade }))
    .sort((a, b) => a.placement - b.placement)
}
