// X01 match stats for the details page: averages, checkout, tiers and best leg per seat, and in
// a team game per team (from the parts, never an average of averages); the same per leg.
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
// One leg has no best leg: its darts thrown already say how long it took
const LEG_ROWS = ROWS.filter(r => r.key !== 'bestLegDarts')

type Visit = {
  seat: number
  leg: number
  darts: number
  scored: number
  checkedOut: boolean
  finish: number
  /** Darts thrown at a finish this visit, and how many of them hit (from the live counting). */
  atFinish: number
  finished: number
}

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
    atFinish: v.end.checkoutAttempts[v.seat] - v.start.checkoutAttempts[v.seat],
    finished: v.end.checkoutHits[v.seat] - v.start.checkoutHits[v.seat],
  }
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
const maxOf = (ns: number[]) => (ns.length > 0 ? Math.max(...ns) : undefined)
const minOf = (ns: number[]) => (ns.length > 0 ? Math.min(...ns) : undefined)
const perVisit = (points: number, darts: number) => (darts > 0 ? (points / darts) * 3 : undefined)

/** The values of a group of seats (one seat, or a team's seats). */
function groupValues(all: Visit[], seats: number[]): Record<string, number | undefined> {
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
    checkoutHits: sum(mine.map(v => v.finished)),
    checkoutAttempts: sum(mine.map(v => v.atFinish)),
    highestFinish: maxOf(mine.filter(v => v.checkedOut).map(v => v.finish)),
    highestScore: maxOf(scores),
    count180: scores.filter(s => s === 180).length,
    count140: scores.filter(s => s >= 140 && s < 180).length,
    count100: scores.filter(s => s >= 100 && s < 140).length,
    bestLegDarts: minOf(legDarts),
    dartsThrown: sum(mine.map(v => v.darts)),
  }
}

type Extra = (seats: number[]) => Record<string, number | undefined>
const none: Extra = () => ({})

/** Every seat's values over these visits, and in a team game every team's. */
function sides(all: Visit[], final: X01State, seatExtra = none, teamExtra = none): Pick<MatchStats, 'seats' | 'teams'> {
  const seats = Array.from({ length: final.playerCount }, (_, seat) => ({
    index: seat,
    values: values({ ...groupValues(all, [seat]), ...seatExtra([seat]) }),
  }))
  if (final.cfg.format !== 'teams') return { seats }
  return {
    seats,
    teams: seatsByTeam(final.teamOf).map((ss, t) => ({ index: t, values: values({ ...groupValues(all, ss), ...teamExtra(ss) }) })),
  }
}

export function x01MatchStats(visits: CommittedVisit<X01State>[], final: X01State): MatchStats {
  const all = visits.filter(v => v.phase === 'game').map(toVisit)
  const teams = final.cfg.format === 'teams'
  const legsWon: Extra = ss => ({ legsWon: final.legs[final.teamOf[ss[0]]] ?? 0 })
  const match = sides(
    all,
    final,
    ss => ({ ...legsWon(ss), ...(teams && { legsClosed: all.filter(v => v.seat === ss[0] && v.checkedOut).length }) }),
    legsWon,
  )
  const legs = [...new Set(all.map(v => v.leg))].map(leg => ({
    leg,
    rows: LEG_ROWS,
    ...sides(
      all.filter(v => v.leg === leg),
      final,
    ),
  }))
  return { rows: ROWS, ...match, legs }
}
