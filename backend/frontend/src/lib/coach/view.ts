// Which finished games the coach reviews, and whose darts it shows.
import type { GameSummary } from '$lib/api'
import { coachable as coachableGame } from '$shared/coach/coachable'

/** The coach reviews the game (shared/coach/coachable.ts) */
export const coachable = (game: Pick<GameSummary, 'mode' | 'config'>): boolean => coachableGame(game.mode, game.config)

/** The seats the coach can review: the humans, in seat order. */
export const coachSeats = (game: Pick<GameSummary, 'players'>): number[] =>
  game.players
    .filter(p => !p.bot)
    .map(p => p.seat)
    .sort((a, b) => a - b)

/** Your seat if you played, else the first human seat; null without one. */
export function defaultCoachSeat(game: Pick<GameSummary, 'players' | 'mySeat'>): number | null {
  const seats = coachSeats(game)
  return game.mySeat !== null && seats.includes(game.mySeat) ? game.mySeat : (seats[0] ?? null)
}

/** The other players' names, comma-separated; "Solo" without one (practice, or you're not a seat). */
export function opponents(game: Pick<GameSummary, 'players' | 'mySeat'>): string {
  const names = game.players.filter(p => p.seat !== game.mySeat).map(p => p.name)
  return names.length ? names.join(', ') : 'Solo'
}

/** The legs the game had: every seat's legs won. */
export const legsPlayed = (game: Pick<GameSummary, 'players'>): number =>
  game.players.reduce((n, p) => n + (Object.hasOwn(p.stats, 'legsWon') ? p.stats.legsWon : 0), 0)
