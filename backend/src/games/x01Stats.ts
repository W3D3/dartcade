// X01 match stats for the details page: averages, checkout, tiers and best leg per seat, and in
// a team game per team (from the parts, never an average of averages).
import type { CommittedVisit, MatchStats } from '../session/types.js'
import type { X01State } from './x01.js'
import { row, values } from './matchStats.js'
import { seatsByTeam } from './teams.js'

const ROWS = [
  row('average', '3-dart average', 'decimal', 'higher'),
  row('first9Average', 'First 9 average', 'decimal', 'higher', { compact: true }),
  row('checkout', 'Checkout', 'ratio', 'higher', { compact: true, value: 'checkoutHits', of: 'checkoutAttempts' }),
  row('highestFinish', 'Highest finish', 'integer', 'higher', { compact: true }),
  row('highestScore', 'Highest score', 'integer', 'higher', { compact: true }),
  row('count180', '180s', 'integer', 'higher'),
  row('count140', '140+', 'integer', 'higher'),
  row('count100', '100+', 'integer', 'higher'),
  row('bestLegDarts', 'Best leg', 'darts', 'lower', { compact: true }),
  row('dartsThrown', 'Darts thrown', 'integer', null, { compact: true }),
]

type Visit = { seat: number; leg: number; darts: number; scored: number; checkedOut: boolean; finish: number }

function toVisit(v: CommittedVisit<X01State>): Visit {
  const t = v.start.teamOf[v.seat]
  const bust = v.end.bustThisVisit
  const checkedOut = v.after.legs[t] > v.start.legs[t]
  return {
    seat: v.seat,
    leg: v.leg,
    darts: v.darts.length,
    scored: bust ? 0 : v.start.scores[t] - v.end.scores[t],
    checkedOut,
    finish: checkedOut ? v.start.scores[t] : 0,
  }
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
const maxOf = (ns: number[]) => (ns.length > 0 ? Math.max(...ns) : undefined)
const minOf = (ns: number[]) => (ns.length > 0 ? Math.min(...ns) : undefined)
const perVisit = (points: number, darts: number) => (darts > 0 ? (points / darts) * 3 : undefined)

/** The values of a group of seats (one seat, or a team's seats). */
function groupValues(all: Visit[], seats: number[], final: X01State): Record<string, number | undefined> {
  const mine = all.filter(v => seats.includes(v.seat))
  const legs = [...new Set(mine.map(v => v.leg))]
  const first9 = legs.flatMap(l => mine.filter(v => v.leg === l && v.darts > 0).slice(0, 3))
  const legDarts = legs
    .filter(l => mine.some(v => v.leg === l && v.checkedOut))
    .map(l => sum(mine.filter(v => v.leg === l).map(v => v.darts)))
  const scores = mine.filter(v => v.darts > 0).map(v => v.scored)
  return {
    average: perVisit(sum(mine.map(v => v.scored)), sum(mine.map(v => v.darts))),
    first9Average: perVisit(sum(first9.map(v => v.scored)), sum(first9.map(v => v.darts))),
    checkoutHits: sum(seats.map(s => final.checkoutHits[s] ?? 0)),
    checkoutAttempts: sum(seats.map(s => final.checkoutAttempts[s] ?? 0)),
    highestFinish: maxOf(mine.filter(v => v.checkedOut).map(v => v.finish)),
    highestScore: maxOf(scores),
    count180: scores.filter(s => s === 180).length,
    count140: scores.filter(s => s >= 140 && s < 180).length,
    count100: scores.filter(s => s >= 100 && s < 140).length,
    bestLegDarts: minOf(legDarts),
    dartsThrown: sum(mine.map(v => v.darts)),
    legsWon: final.legs[final.teamOf[seats[0]]] ?? 0,
  }
}

export function x01MatchStats(visits: CommittedVisit<X01State>[], final: X01State): MatchStats {
  const all = visits.filter(v => v.phase === 'game').map(toVisit)
  const teams = final.cfg.format === 'teams'
  const seats = Array.from({ length: final.playerCount }, (_, seat) => ({
    index: seat,
    values: values({
      ...groupValues(all, [seat], final),
      ...(teams && { legsClosed: all.filter(v => v.seat === seat && v.checkedOut).length }),
    }),
  }))
  if (!teams) return { rows: ROWS, seats }
  return {
    rows: ROWS,
    seats,
    teams: seatsByTeam(final.teamOf).map((ss, t) => ({ index: t, values: values(groupValues(all, ss, final)) })),
  }
}
