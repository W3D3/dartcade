// Pure view helpers for Catch 40: the header line, the dart pips, the hint and the result banner.
// Fed by the Catch40Game snapshot.
import type { Catch40Game } from '../api/game-ws'
import { plural } from '../fmt.js'

import { DARTS_PER_TARGET, LAST_TARGET } from '$shared/catch40'

export { DARTS_PER_TARGET, TARGETS } from '$shared/catch40'

/** "Target 63 of 100 · 6 darts · double out"; "Session summary" once the game has finished. */
export function catch40Meta(game: Catch40Game, seat: number): string {
  if (game.phase === 'finished') return 'Session summary'
  return `Target ${Math.min(game.seats[seat].target, LAST_TARGET)} of ${LAST_TARGET} · ${DARTS_PER_TARGET} darts · double out`
}

/** "3 pts" / "1 pt" / "0 pts". */
export const pointsLabel = (points: number): string => plural(points, 'pt')

/** 3-dart groups of pips for the open target: 'used' (committed visits), 'current' (thrown in the
 *  open visit), 'open' (not thrown). */
export function catch40Pips(game: Catch40Game, seat: number, visitDarts: number): ('used' | 'current' | 'open')[][] {
  const used = game.seats[seat].darts
  const pips: ('used' | 'current' | 'open')[] = Array.from({ length: DARTS_PER_TARGET }, (_, i) =>
    i < used ? 'used' : i < used + visitDarts ? 'current' : 'open',
  )
  return [pips.slice(0, 3), pips.slice(3)]
}

/** The banner after a target: points scored, for the seat the result belongs to; null otherwise. */
export function catch40Banner(game: Catch40Game, seat: number): { kind: 'made' | 'missed'; text: string } | null {
  const r = game.lastResult
  if (!r || r.seat !== seat) return null
  if (r.points === 0 && r.darts >= DARTS_PER_TARGET) return { kind: 'missed', text: `Missed ${r.target} · 0 pts` }
  return { kind: 'made', text: `Checked out ${r.target} in ${plural(r.darts, 'dart')} · ${pointsLabel(r.points)}` }
}
