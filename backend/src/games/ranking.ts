/**
 * 1-based placements per seat. The winner is always 1st (a game can name a winner the
 * order alone wouldn't, e.g. X01's round limit); the others are ranked by `compare`
 * (negative: `a` ahead of `b`) from 2nd on, and seats `compare` finds equal share a
 * placement (1, 2, 2, 4).
 */
export function rankSeats(n: number, winner: number | null, compare: (a: number, b: number) => number): number[] {
  const placements = Array<number>(n).fill(0)
  if (winner !== null) placements[winner] = 1
  const first = winner === null ? 1 : 2
  const rest = Array.from({ length: n }, (_, i) => i)
    .filter(i => i !== winner)
    .sort(compare)
  rest.forEach((seat, k) => {
    const prev = rest[k - 1]
    placements[seat] = k > 0 && compare(prev, seat) === 0 ? placements[prev] : first + k
  })
  return placements
}

/**
 * Placements once some seats forfeited: they share last place; the others keep their
 * order from `placements` (ties too), counted only among themselves.
 */
export function forfeitPlacements(placements: number[], forfeited: ReadonlySet<number>): number[] {
  const live = placements.flatMap((_, i) => (forfeited.has(i) ? [] : [i]))
  return placements.map((p, i) => (forfeited.has(i) ? live.length + 1 : 1 + live.filter(j => placements[j] < p).length))
}
