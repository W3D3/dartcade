// Turn rotation shared by the games that play seats in a throw order.

/**
 * The next turn in `order` after `turn` whose seat can still throw, going round and coming back to
 * the current seat last; `wrapped` when it went past the end of `order` (a new round). Null when no
 * seat can throw.
 */
export function nextTurn(
  order: number[],
  turn: number,
  canThrow: (seat: number) => boolean,
): { turn: number; seat: number; wrapped: boolean } | null {
  const n = order.length
  for (let i = 1; i <= n; i++) {
    const t = (turn + i) % n
    if (canThrow(order[t])) return { turn: t, seat: order[t], wrapped: turn + i >= n }
  }
  return null
}

/**
 * Who throws after the open visit: the seat `commit` (the game's own end of visit and rotation)
 * would move to if the visit ended now. Null once the game is over, or when this visit would end it.
 */
export function upNext<S extends { phase: string; currentPlayer: number }>(s: S, commit: (s: S) => S): number | null {
  if (s.phase === 'finished') return null
  const after = commit(s)
  return after.phase === 'finished' ? null : after.currentPlayer
}
