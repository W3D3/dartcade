// What a ranked team game adds to the match screen (MM-Match-Teams board): the team's rating, the
// order the seats throw in, and the team's own Turn and Reserve clocks.
import { clock } from './queue'
import { clockView } from './clock'
import { seatRank, upLeft, type RankedState, type SeatRank } from './inGame'
import type { TeamMember } from '$lib/teams'

/** The team's rating: its players' ratings averaged. Null while one of them has none (still placing, a guest). */
export function teamRating(seats: readonly (SeatRank | null)[]): number | null {
  const ratings = seats.map(s => s?.rating ?? null)
  if (ratings.length === 0 || ratings.some(r => r === null)) return null
  return Math.round(ratings.reduce<number>((a, r) => a + (r ?? 0), 0) / ratings.length)
}

/** "Marco & Jule", "A, B & C". */
export const andList = (names: readonly string[]): string =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`

/**
 * The seats in the order they throw this leg, starting with the thrower: the teams take turns and each one
 * goes round its own players (a smaller team's seats repeat), as the server's turn rotation does. Null once
 * nobody is up (the game is won) or when the next thrower is not on another team.
 */
export function throwOrder(teams: readonly { members: readonly TeamMember[] }[]): number[] | null {
  const up = teams.findIndex(t => t.members.some(m => m.role === 'throwing'))
  if (up < 0 || teams.length < 2) return null
  // The next thrower's team goes second, the others follow in team order
  const next = teams.findIndex((t, i) => i !== up && t.members.some(m => m.role === 'up-next'))
  if (next < 0) return null
  const rotation = [up, next, ...teams.map((_, i) => i).filter(i => i !== up && i !== next)]
  // Each team's seats, starting at the one that throws next for it
  const seats = (t: number) => {
    const ms = teams[t].members
    const start = ms.findIndex(m => m.role === (t === up ? 'throwing' : 'up-next'))
    return (start < 0 ? ms : [...ms.slice(start), ...ms.slice(0, start)]).map(m => m.seat)
  }
  const bySeats = rotation.map(seats)
  const rounds = Math.max(...bySeats.map(s => s.length))
  const order: number[] = []
  for (let r = 0; r < rounds; r++) for (const s of bySeats) order.push(s[r % s.length])
  return order
}

export type TeamClocks = {
  /** "0:24": the visit's time left for the team that is up, the full visit otherwise. */
  turn: string
  /** The team's reserve. */
  reserve: string
  /** The team is up and its clock runs. */
  running: boolean
  /** The reserve is being used and is nearly gone (`clockView`'s reserve phase, as the banner over the board). */
  low: boolean
}

/** A team's Turn and Reserve chips at `now` (this screen's clock; `skew` is the server's minus it). */
export function teamClocks(ranked: RankedState, seat: number, up: boolean, skew: number, now: number): TeamClocks {
  // Only the team that is up has a clock running
  const left = up ? upLeft(ranked, skew, now) : null
  const inReserve = left !== null && left.visitLeft <= 0
  const secs = (s: number) => clock(Math.max(0, Math.ceil(s)))
  return {
    turn: secs(left?.visitLeft ?? ranked.visitSeconds),
    reserve: secs(inReserve ? left.reserveLeft : (ranked.seats[seat]?.reserveSeconds ?? ranked.reserveSeconds)),
    running: left !== null,
    // The same moment the banner over the board turns red
    low: left !== null && clockView(left).phase === 'reserve',
  }
}

/** What a team panel shows in a ranked game. */
export type TeamRanked = {
  /** The chip's text: "Your duo", "Marco & Jule". */
  label: string
  rating: number | null
  /** Per seat (the snapshot's seat order): its rank chip data. */
  ranks: readonly (SeatRank | null)[]
  ranked: RankedState
  skew: number
}

/** "Your duo" for the viewer's own team, the players' names for the other. */
function rankedTeamLabel(names: readonly string[], mine: boolean): string {
  return mine ? (names.length === 2 ? 'Your duo' : 'Your team') : andList(names)
}

/** A team's ranked view for its panel; null in a game that is not ranked. */
export function teamRanked(
  ranked: RankedState | null,
  members: readonly Pick<TeamMember, 'seat' | 'name'>[],
  mySeats: readonly number[],
  skew: number,
): TeamRanked | null {
  if (!ranked) return null
  const ranks = ranked.seats.map(s => seatRank(s))
  return {
    label: rankedTeamLabel(
      members.map(m => m.name),
      members.some(m => mySeats.includes(m.seat)),
    ),
    rating: teamRating(members.map(m => ranks[m.seat] ?? null)),
    ranks,
    ranked,
    skew,
  }
}
