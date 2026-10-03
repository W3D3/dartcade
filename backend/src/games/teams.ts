import { forfeitPlacements } from './ranking.js'

/** What a game that supports teams reads from its config (see the teams design). */
export type TeamsConfig = { format?: 'singles' | 'teams'; teams?: number[]; teamStart?: 'first' | 'random' }

export function teamOfSeats(cfg: TeamsConfig, seatCount: number): number[] {
  const own = Array.from({ length: seatCount }, (_, i) => i)
  if (cfg.format !== 'teams' || !cfg.teams || cfg.teams.length !== seatCount) return own

  // Validate that all values are non-negative integers and every index from 0 to max is used
  if (!cfg.teams.every(t => Number.isInteger(t) && t >= 0)) return own
  const max = Math.max(...cfg.teams, -1)
  const used = new Set(cfg.teams)
  for (let i = 0; i <= max; i++) {
    if (!used.has(i)) return own
  }

  return [...cfg.teams]
}

/** The team index of every seat; without teams each seat is its own team. */
export const teamCount = (teamOf: number[]): number => teamOf.length === 0 ? 0 : Math.max(...teamOf) + 1

/** Seats of each team, in seat order. */
export function seatsByTeam(teamOf: number[]): number[][] {
  const out: number[][] = Array.from({ length: teamCount(teamOf) }, () => [])
  teamOf.forEach((t, seat) => out[t].push(seat))
  return out
}

/**
 * The turn rotation: one seat per turn, teams alternating, starting with `startTeam`; a
 * smaller team's seats repeat (A1 B1 A2 B1). Singles: [0, 1, … n-1] rotated to start at
 * startTeam. With `leadSeat` (a seat of `startTeam`, e.g. the bull off winner) that team's
 * seats are rotated to start at it (A2 B1 A1 B2); the other teams keep seat order.
 */
export function turnOrder(teamOf: number[], startTeam: number, leadSeat?: number): number[] {
  const teams = seatsByTeam(teamOf)
  if (leadSeat !== undefined && teams[startTeam]?.includes(leadSeat)) {
    const seats = teams[startTeam]
    const at = seats.indexOf(leadSeat)
    teams[startTeam] = [...seats.slice(at), ...seats.slice(0, at)]
  }
  const n = teams.length
  if (n === 0) return []
  const rounds = Math.max(...teams.map(t => t.length))
  const order: number[] = []
  for (let r = 0; r < rounds; r++) {
    for (let k = 0; k < n; k++) {
      const team = teams[(startTeam + k) % n]
      order.push(team[r % team.length])
    }
  }
  return order
}

/** Placements per seat from placements per team (1-based, ties shared). */
export function seatPlacements(teamOf: number[], teamPlacements: number[]): number[] {
  return teamOf.map(t => teamPlacements[t])
}

/**
 * Placements once some seats forfeited. In a team game (some team has more than one
 * seat), places are counted among teams, not seats: a team's placement is the one
 * `placements` already gives its seats (they share one, from `summarize`), a forfeited
 * team ranks last among teams, and the result is mapped back to seats — so two teams
 * forfeiting down to one come out as 1st and 2nd, not spread by seat count. Singles
 * (every seat its own team) is unchanged: today's seat-level skip-ranking from
 * `forfeitPlacements`.
 */
export function teamForfeitPlacements(teamOf: number[], placements: number[], forfeited: ReadonlySet<number>): number[] {
  if (teamCount(teamOf) === teamOf.length) return forfeitPlacements(placements, forfeited)
  const teamPlacements = seatsByTeam(teamOf).map(seats => placements[seats[0]])
  const forfeitedTeams = new Set([...forfeited].map(seat => teamOf[seat]))
  return seatPlacements(teamOf, forfeitPlacements(teamPlacements, forfeitedTeams))
}
