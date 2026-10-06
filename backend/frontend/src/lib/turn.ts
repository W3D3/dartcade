import type { Snapshot } from '$lib/api'

/**
 * The seat that's up: during a bull off its thrower, or its winner once it's decided
 * (they start the game); otherwise whoever's turn it is.
 */
export function upSeat(snap: Snapshot): number {
  const g = snap.game
  const bullOff = 'bullOff' in g ? g.bullOff : null
  if (bullOff) return bullOff.result && !bullOff.result.rethrow ? (bullOff.result.order[0] ?? 0) : bullOff.currentPlayer
  return g.currentPlayer
}

/** The viewer controls the seat that's up (in a local game: always). */
export function isMyTurn(snap: Snapshot | null): boolean {
  return snap !== null && snap.mySeats.includes(upSeat(snap))
}

/**
 * The viewer should get live entry controls (keypad, board-click-to-score) for the seat
 * that's up: `isMyTurn`, but not while a bot — which the host controls but doesn't throw
 * for — is the one up. The host still controls the bot's seat (so Undo stays reachable to
 * fix a misdetected bot throw; see `isMyTurn`), but shouldn't be invited to throw its darts.
 */
export function canThrowNow(snap: Snapshot | null): boolean {
  if (!isMyTurn(snap) || snap === null) return false
  return snap.seats[upSeat(snap)]?.bot == null
}
