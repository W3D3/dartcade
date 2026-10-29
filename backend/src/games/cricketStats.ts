// Cricket match stats for the details page: marks per round, per-target mark counts, high-mark
// rounds and points, per seat and in a team game per team (from the parts, as x01Stats.ts does).
import type { CommittedVisit, MatchStats } from '../session/types.js'
import type { CricketState } from './cricket.js'
import { TARGETS } from './cricketRules.js'
import { row, values } from './matchStats.js'
import { seatsByTeam } from './teams.js'

const TARGET_KEYS = TARGETS.map(t => (t === 25 ? 'marksBull' : `marks${t}`))
const TARGET_LABELS = TARGETS.map(t => (t === 25 ? 'Bulls' : `${t}s`))

const ROWS = [
  row('mpr', 'Marks per round', 'decimal', 'higher'),
  ...TARGETS.map((_, i) => row(TARGET_KEYS[i], TARGET_LABELS[i], 'integer', 'higher', { compact: true })),
  row('visits5', '5+ mark rounds', 'integer', 'higher'),
  row('visits7', '7+ mark rounds', 'integer', 'higher'),
  row('visits9', '9 mark rounds', 'integer', 'higher'),
  row('points', 'Points', 'integer', null),
  row('dartsThrown', 'Darts thrown', 'integer', null, { compact: true }),
]

type Visit = { seat: number; marks: number; targetMarks: number[]; darts: number }

// `v.end` is the state after the visit's last dart, before it was committed: visitMarks and
// targetMarks still hold this visit's own counts at that point (committedVisit resets them).
function toVisit(v: CommittedVisit<CricketState>): Visit {
  return {
    seat: v.seat,
    marks: v.end.visitMarks,
    targetMarks: TARGETS.map((_, i) => v.end.targetMarks[v.seat][i] - v.start.targetMarks[v.seat][i]),
    darts: v.darts.length,
  }
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

/** The values of a group of seats (one seat, or a team's seats), without `points` (shared, team-wide). */
function groupValues(all: Visit[], seats: number[]): Record<string, number | undefined> {
  const mine = all.filter(v => seats.includes(v.seat))
  const marks = sum(mine.map(v => v.marks))
  const darts = sum(mine.map(v => v.darts))
  const targets = Object.fromEntries(TARGET_KEYS.map((key, i) => [key, sum(mine.map(v => v.targetMarks[i]))]))
  return {
    mpr: darts > 0 ? (marks / darts) * 3 : 0,
    ...targets,
    visits5: mine.filter(v => v.marks >= 5).length,
    visits7: mine.filter(v => v.marks >= 7).length,
    visits9: mine.filter(v => v.marks >= 9).length,
    dartsThrown: darts,
  }
}

// The board (and its points) resets every leg, so the match total is each leg's last committed
// visit (whoever threw it): its `end.board.points` is that leg's cumulative total for the team.
function matchPoints(gameVisits: CommittedVisit<CricketState>[], team: number): number {
  const lastOfLeg = new Map<number, CommittedVisit<CricketState>>()
  for (const v of gameVisits) lastOfLeg.set(v.leg, v)
  return sum([...lastOfLeg.values()].map(v => v.end.board.points[team] ?? 0))
}

export function cricketMatchStats(visits: CommittedVisit<CricketState>[], final: CricketState): MatchStats {
  const gameVisits = visits.filter(v => v.phase === 'game')
  const all = gameVisits.map(toVisit)
  const points = (seats: number[]) => matchPoints(gameVisits, final.teamOf[seats[0]])
  const legsWon = (seats: number[]) => final.legs[final.teamOf[seats[0]]] ?? 0
  const seats = Array.from({ length: final.playerCount }, (_, seat) => ({
    index: seat,
    values: values({ ...groupValues(all, [seat]), points: points([seat]), legsWon: legsWon([seat]) }),
  }))
  if (final.cfg.format !== 'teams') return { rows: ROWS, seats }
  const teams = seatsByTeam(final.teamOf).map((ss, t) => ({
    index: t,
    values: values({ ...groupValues(all, ss), points: points(ss), legsWon: legsWon(ss) }),
  }))
  return { rows: ROWS, seats, teams }
}
