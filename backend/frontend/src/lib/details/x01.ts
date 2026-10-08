// X01 on the details page: the sides (seats, or teams), and per leg the points-left chart, the
// chalkboard and the one-line summary, all from the server's X01Detail.
import type { GameSummary, Segment, X01Detail } from '../api'

export type Side = { key: number; name: string; seats: number[] }
export type ChalkCell = {
  seat: number
  scored: number
  left: number
  darts: string[]
  bust: boolean
  out: boolean
  tier: 'max' | 'ton' | null
  crossed: boolean
}
export type ChalkRow = { n: number; cells: (ChalkCell | null)[] }
type Visit = X01Detail['legs'][number]['visits'][number]

export function x01Sides(game: GameSummary, detail: X01Detail): Side[] {
  if (detail.teams) return detail.teams.map((t, key) => ({ key, name: t.name, seats: t.seats }))
  return [...game.players].sort((a, b) => a.seat - b.seat).map(p => ({ key: p.seat, name: p.name, seats: [p.seat] }))
}

export function dartLabel(s: Segment): string {
  if (s.multiplier === 0) return '–'
  if (s.number === 50) return 'Bull'
  if (s.number === 25) return '25'
  return `${s.multiplier === 3 ? 'T' : s.multiplier === 2 ? 'D' : 'S'}${s.number}`
}

const legOf = (detail: X01Detail, leg: number) => detail.legs.find(l => l.leg === leg)
const sideVisits = (detail: X01Detail, leg: number, side: Side): Visit[] =>
  (legOf(detail, leg)?.visits ?? []).filter(v => side.seats.includes(v.seat))

export function legSeries(detail: X01Detail, leg: number, sides: Side[], start: number) {
  return sides.map(side => ({
    key: side.key,
    points: [
      { visit: 0, left: start, scored: 0 },
      ...sideVisits(detail, leg, side).map((v, i) => ({ visit: i + 1, left: v.remaining, scored: v.scored })),
    ],
  }))
}

export function chalkboardRows(detail: X01Detail, leg: number, sides: Side[]): ChalkRow[] {
  const perSide = sides.map(side => sideVisits(detail, leg, side))
  const winner = legOf(detail, leg)?.winner ?? null
  const n = Math.max(0, ...perSide.map(vs => vs.length))
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    cells: perSide.map(vs => {
      const v = vs.at(i)
      if (!v) return null
      const last = i === vs.length - 1
      return {
        seat: v.seat,
        scored: v.scored,
        left: v.remaining,
        darts: v.darts.map(d => dartLabel(d.segment)),
        bust: v.bust,
        out: last && winner !== null && v.seat === winner,
        tier: v.scored === 180 ? 'max' : v.scored >= 100 ? 'ton' : null,
        crossed: !last,
      }
    }),
  }))
}

/**
 * Y-axis ticks for the remaining-points chart: ascending, duplicate-free multiples of a step
 * picked from the start score, all at or below it so none lands above the plot.
 */
export function remainingTicks(start: number): number[] {
  const step = start >= 600 ? 200 : start >= 300 ? 100 : start >= 100 ? 50 : start >= 50 ? 20 : 10
  const ticks: number[] = []
  for (let t = 0; t <= start; t += step) ticks.push(t)
  return ticks
}

export function legSummary(
  detail: X01Detail,
  leg: number,
  sides: Side[],
  nameOf: (seat: number) => string,
  forfeitedBy: string | null,
): string {
  const l = legOf(detail, leg)
  if (!l) return ''
  const first = `${nameOf(l.starter)} threw first`
  if (l.winner === null) {
    if (forfeitedBy) return `Not finished: ${forfeitedBy} gave up · ${first}`
    return `No winner: the round limit ended it · ${first}`
  }
  const winner = l.winner
  const side = sides.find(s => s.seats.includes(winner))
  const winnerName = side && side.seats.length > 1 ? side.name : nameOf(winner)
  const darts = side ? sideVisits(detail, leg, side).reduce((n, v) => n + v.darts.length, 0) : 0
  const checkout =
    l.visits
      .at(-1)
      ?.darts.map(d => dartLabel(d.segment))
      .join(' · ') ?? ''
  return `${winnerName} won in ${darts} darts, checking out ${checkout} · ${first}`
}
