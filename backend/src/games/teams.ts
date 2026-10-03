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

/** The turn rotation: one seat per turn, teams alternating, starting with `startTeam`; a smaller team's seats repeat (A1 B1 A2 B1). Singles: [0, 1, … n-1] rotated to start at startTeam. */
export function turnOrder(teamOf: number[], startTeam: number): number[] {
  const teams = seatsByTeam(teamOf)
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

/** Every seat of a team that has a forfeited seat. */
export function forfeitedTeamSeats(teamOf: number[], forfeited: ReadonlySet<number>): Set<number> {
  const teams = new Set([...forfeited].map(seat => teamOf[seat]))
  return new Set(teamOf.flatMap((t, seat) => teams.has(t) ? [seat] : []))
}
