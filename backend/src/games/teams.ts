import type { Rng } from '../session/rng.js'
import type { ConfigFieldMeta, Player } from '../session/types.js'
import { forfeitPlacements } from './ranking.js'

/** What a game that supports teams reads from its config (see the teams design). */
export type TeamsConfig = {
  format?: 'singles' | 'teams'
  teams?: number[]
  teamStart?: 'first' | 'random'
  /** Each team's name (a tournament's team entries); else Team A, Team B. */
  teamNames?: string[]
}

// Teams are Team A (index 0) and Team B (index 1)
/** Checks a two-team config: in `'teams'` format, `teams` must have one entry per player and both teams a player. */
export function validateTwoTeams(cfg: TeamsConfig, players: Player[]): string | null {
  if (cfg.format !== 'teams') return null
  const teams = cfg.teams
  const ok =
    teams !== undefined && teams.length === players.length && teams.every(t => t === 0 || t === 1) && teams.includes(0) && teams.includes(1)
  return ok ? null : 'teams need one entry per player, and both teams a player'
}

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
export const teamCount = (teamOf: number[]): number => (teamOf.length === 0 ? 0 : Math.max(...teamOf) + 1)

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

// The start moves on every leg, whoever won the last one: leg 1 starts at the first
// position in throw order, leg 2 at the second, and so on, wrapping around. With teams
// taking turns in `order`, the starting team alternates.
export function legStart(order: number[], legs: number[]): number {
  const played = legs.reduce((a, b) => a + b, 0)
  return played % order.length
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

const TEAM_IDS = ['A', 'B'] as const

/** The setup form's Format option. */
export const FORMAT_OPTION: ConfigFieldMeta = {
  label: 'Format',
  tooltip: 'Teams: Team A against Team B, each sharing one score. Players take turns across the teams.',
  options: [
    { value: 'singles', label: 'Singles' },
    { value: 'teams', label: 'Teams' },
  ],
}

/** The team that throws first: Team A, or a coin flip when the lobby asked for a random start. */
export function startTeam(cfg: TeamsConfig, rng?: Rng): number {
  return cfg.format === 'teams' && cfg.teamStart === 'random' && rng ? (rng() < 0.5 ? 0 : 1) : 0
}

type TeamEntry = { id: (typeof TEAM_IDS)[number]; name: string; seats: number[] }

/** One entry per team (id, name, seats) for a snapshot or detail; `extra` adds the mode's per-team fields. */
export function teamEntries(cfg: TeamsConfig, teamOf: number[]): TeamEntry[]
export function teamEntries<E extends object>(cfg: TeamsConfig, teamOf: number[], extra: (team: number) => E): (TeamEntry & E)[]
export function teamEntries(cfg: TeamsConfig, teamOf: number[], extra?: (team: number) => object): TeamEntry[] {
  return seatsByTeam(teamOf).map((seats, t) => ({
    id: TEAM_IDS[t],
    name: cfg.teamNames?.[t] ?? `Team ${TEAM_IDS[t]}`,
    seats,
    ...extra?.(t),
  }))
}

/** A bull off's `applyStartOrder`: in a team game the winner throws first and the teams take turns. */
export function teamsApplyStartOrder<
  S extends { cfg: TeamsConfig; teamOf: number[]; order: number[]; turn: number; currentPlayer: number },
>(s: S, bullOffOrder: number[]): S {
  const winner = bullOffOrder[0]
  const order = s.cfg.format === 'teams' ? turnOrder(s.teamOf, s.teamOf[winner], winner) : bullOffOrder
  return { ...s, order, turn: 0, currentPlayer: order[0] }
}
