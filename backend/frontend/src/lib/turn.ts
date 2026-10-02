import type { Snapshot } from '$lib/api'

/**
 * The seat that's up: during a bull off its thrower, or its winner once it's decided
 * (they start the game); otherwise whoever's turn it is.
 */
export function upSeat(snap: Snapshot): number {
  const g = snap.game
  const bullOff = 'bullOff' in g ? g.bullOff : null
  if (bullOff) return bullOff.result && !bullOff.result.rethrow ? bullOff.result.order[0] ?? 0 : bullOff.currentPlayer
  return g.currentPlayer
}

/** The viewer controls the seat that's up (in a local game: always). */
export function isMyTurn(snap: Snapshot | null): boolean {
  return snap !== null && snap.mySeats.includes(upSeat(snap))
}
