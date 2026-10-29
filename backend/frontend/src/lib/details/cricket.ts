// Cricket on the details page: a past leg's final marks, built into a CricketGame stub that
// the match screen's MarksGrid (and its cricketSides) can render as-is.
import type { CricketGame, GameDetail, GameSeat } from '../api'

type CricketDetail = Extract<GameDetail['detail'], { mode: 'cricket' }>
type CricketLeg = CricketDetail['legs'][number]

/** `GameDetail.game.players` by seat index, for `cricketSides` (which, like the live snapshot's
 *  `players`, expects a seat-indexed array). */
export function playersBySeat(players: GameSeat[]): { name: string }[] {
  const arr: { name: string }[] = []
  for (const p of players) arr[p.seat] = { name: p.name }
  return arr
}

const countBySeat = (visits: CricketLeg['visits']): Map<number, number> => {
  const counts = new Map<number, number>()
  for (const v of visits) counts.set(v.seat, (counts.get(v.seat) ?? 0) + 1)
  return counts
}

/** `leg.marks` is per team; one row per seat, as the live snapshot's own `marks` is (`s.teamOf.map(t
 *  => s.board.marks[t])`), so `MarksGrid`'s `game.marks[seat]` lines up with the right team. Singles:
 *  every seat is its own team, so this is the identity. */
function marksBySeat(detail: CricketDetail, marks: CricketLeg['marks']): CricketLeg['marks'] {
  if (!detail.teams) return marks
  const rows: CricketLeg['marks'] = []
  detail.teams.forEach((t, ti) => t.seats.forEach(seat => (rows[seat] = marks[ti] ?? [])))
  return rows
}

/**
 * A past leg's final marks as a `CricketGame` MarksGrid can render: `targets`, `marks`, `points`
 * and `closed` come straight from the leg (`marks` expanded to one row per seat, see
 * `marksBySeat`); `legs` (and, in a team game, `teams[].legs`) is rigged so `legNumber(game)`
 * reads back as this leg's own number (its caption) either way. `round` is however many rounds
 * its longest-throwing seat took. `winner` is converted from `leg.winner` (a seat, per
 * `CricketDetail`) to the winning side's index, the live game's own convention
 * (`teamOf.indexOf(winner)`; in singles a seat is its own side). Nobody is "up" (`currentPlayer`
 * is -1, no real seat): the rest of the fields aren't read by the grid in its non-party variants.
 */
export function legMarksGame(detail: CricketDetail, leg: CricketLeg): CricketGame {
  const targets = detail.targets
  const marks = marksBySeat(detail, leg.marks)
  const closed = targets.map((_, i) => marks.every(row => row[i] >= 3))
  const zeros = () => marks.map(() => 0)
  const winnerSeat = leg.winner
  const winner = winnerSeat === null ? null : detail.teams ? detail.teams.findIndex(t => t.seats.includes(winnerSeat)) : winnerSeat
  const game: CricketGame = {
    config: { mode: 'standard', firstTo: 1, botSpeed: 'normal' },
    phase: 'finished',
    targets,
    marks,
    points: leg.points,
    legs: marks.map((_, i) => (i === 0 ? leg.leg : 0)),
    firstTo: 1,
    closed,
    scorable: targets.map(() => false),
    currentPlayer: -1,
    nextPlayer: null,
    round: Math.max(0, ...countBySeat(leg.visits).values()),
    winner,
    visitLocked: false,
    marksScored: zeros(),
    dartsThrown: zeros(),
    lastVisit: marks.map(() => null),
    bullOff: null,
    currentVisitDarts: [],
    totalDarts: zeros(),
    totalVisits: zeros(),
  }
  if (detail.teams) game.teams = detail.teams.map((t, i) => ({ ...t, points: 0, legs: i === 0 ? leg.leg : 0 }))
  return game
}
