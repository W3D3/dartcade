// Which finished games the coach reviews, and whose darts it shows.
import type { GameSummary } from '$lib/api'

/** X01, straight in, double out, bull 25/50, singles. A missing key is X01's default. */
export function coachable(game: Pick<GameSummary, 'mode' | 'config'>): boolean {
  if (game.mode !== 'x01') return false
  const c = game.config
  return (
    (c.inMode ?? 'straight') === 'straight' &&
    (c.outMode ?? 'double') === 'double' &&
    (c.bullValue ?? '25_50') === '25_50' &&
    (c.format ?? 'singles') !== 'teams'
  )
}

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
