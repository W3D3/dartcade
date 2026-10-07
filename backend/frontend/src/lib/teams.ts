// Team games (X01): the "Teams 2v2" label, the winning team, and what each team panel shows,
// computed from the snapshot. The teams themselves come from the server.
import { avgOf, checkoutRate, x01Player } from './playerStats.js'
import type { Visit } from './visitHistory.js'
import type { ScoreUpdates } from './heldScore.js'
import type { CheckoutPrefs } from '$shared/checkout.js'
import type { X01Game } from './api/game-ws'
import { initial } from './fmt.js'

export type Team = NonNullable<X01Game['teams']>[number]

/** "Teams 2v2", "Teams 1v2": the team sizes, Team A's first. */
export const teamSizesLabel = (sizes: number[]): string => `Teams ${sizes.join('v')}`

/** The match header's label for the game's teams. */
export const teamsLabel = (teams: Pick<Team, 'seats'>[]): string => teamSizesLabel(teams.map(t => t.seats.length))

/** The seat's team; null in a singles game. */
export function teamOf(game: { teams?: Team[] }, seat: number): Team | null {
  return game.teams?.find(t => t.seats.includes(seat)) ?? null
}

/** Who the win overlay names: the winning team in a team game, else the winning player; null before a win. */
export function winnerName(game: { winner: number | null; teams?: Team[] }, players: { name: string }[]): string | null {
  if (game.winner === null) return null
  return teamOf(game, game.winner)?.name ?? players.at(game.winner)?.name ?? null
}

export type TeamMember = {
  seat: number
  name: string
  /** The player's own 3-dart average over the match. */
  avg: string
  /** Throwing, up next (the next thrower of the game), "after" for the rest; null once the game is won. */
  role: 'throwing' | 'up-next' | 'after' | null
}

export type X01TeamView = {
  id: Team['id']
  name: string
  /** The team of the thrower, while the game is on. */
  active: boolean
  won: boolean
  remaining: number
  /** The big score: `remaining`, or held at the visit's start while the team's visit is open. */
  shown: number
  opened: boolean
  /** "T19 · D12", or null when no finish is possible (or suggestions are off). */
  canFinish: string | null
  /** This leg's 3-dart average over the team's visits. */
  teamAvg: string
  /** The match's 3-dart average over the team's visits. */
  matchAvg: string
  /** Darts at a finish that hit, over the team's players. */
  checkout: string
  checkoutDarts: string
  darts: number
  legsWon: number
  firstTo: number
  /** Legs played so far (both teams'): the score starts over when it changes. */
  leg: number
  /** Finished visits of this leg, in the order thrown, and the thrower's initial for each. */
  visits: Visit[]
  marks: string[]
  /** The thrower's running visit and their initial. */
  current: { scored: number; left: number; bust: boolean } | null
  currentMark: string | null
  members: TeamMember[]
}

/** One view per team; none in a singles game. */
export function x01Teams(
  game: X01Game,
  players: { name: string }[],
  o: { suggest: boolean; checkout?: CheckoutPrefs; scoreUpdates?: ScoreUpdates },
): X01TeamView[] {
  const teams = game.teams
  if (!teams) return []
  const playing = game.winner === null
  const cp = game.currentPlayer
  const upTeam = teamOf(game, cp)
  // The server names who throws next (the next leg's starter after a checkout)
  const nextSeat = game.nextPlayer
  const nameOf = (seat: number) => players.at(seat)?.name ?? ''

  return teams.map(team => {
    const active = playing && upTeam === team
    // The thrower carries the running visit; any seat of the team has its score
    const seat = active ? cp : (team.seats.at(0) ?? 0)
    const p = x01Player(game, seat, {
      active,
      suggest: o.suggest,
      checkout: o.checkout,
      bust: active && game.bustThisVisit,
      scoreUpdates: o.scoreUpdates,
    })

    // This leg's visits by the team's players, in the order they were thrown
    const mine = game.legVisits.filter(v => team.seats.includes(v.seat))
    const visits: Visit[] = mine
    const marks = mine.map(v => initial(nameOf(v.seat)))
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    const of = (field: number[]) => sum(team.seats.map(s => field.at(s) ?? 0))

    return {
      id: team.id,
      name: team.name,
      active,
      won: game.winner !== null && team.seats.includes(game.winner),
      remaining: team.score,
      shown: active ? p.shown : team.score,
      opened: p.opened,
      canFinish: p.canFinish,
      teamAvg: avgOf(sum(mine.map(v => v.scored)), sum(mine.map(v => v.darts))),
      matchAvg: avgOf(of(game.pointsScored), of(game.dartsThrown)),
      ...checkoutRate(of(game.checkoutHits), of(game.checkoutAttempts)),
      darts: team.seats.reduce((a, s) => a + (game.totalDarts.at(s) ?? 0), 0),
      legsWon: team.legs,
      firstTo: game.firstTo,
      leg: teams.reduce((a, t) => a + t.legs, 0),
      visits,
      marks,
      current: p.current,
      currentMark: p.current ? initial(nameOf(cp)) : null,
      members: team.seats.map(s => ({
        seat: s,
        name: nameOf(s),
        avg: avgOf(game.pointsScored.at(s) ?? 0, game.dartsThrown.at(s) ?? 0),
        role: !playing ? null : s === cp ? 'throwing' : s === nextSeat ? 'up-next' : 'after',
      })),
    }
  })
}
