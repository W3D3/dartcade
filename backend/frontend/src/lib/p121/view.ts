// Pure view helpers for 121 Checkout: the header meta line, the hint under the card, the dart
// pips and the made/missed banner. Fed by the P121Game snapshot; see the design spec.
import type { P121Game } from '../api/game-ws'
import { plural } from '../fmt.js'

/** "Try 4 of 10 · 9 darts · double out"; "Session summary" once the game has finished. */
export function p121Meta(game: P121Game, seat: number): string {
  if (game.phase === 'finished') return 'Session summary'
  const { cfg } = game
  const n = Math.min(game.seats[seat].tries.length + 1, cfg.tries)
  return `Try ${n} of ${cfg.tries} · ${cfg.dartsPerTry} darts · ${cfg.outMode} out`
}

/** The hint under the card: the route to finish, or a plain score when none fits (above 170,
 *  or no combination finishes with the darts left in this visit; Review Focus 4). */
export function p121Hint(game: P121Game, seat: number, route: string[] | null): string {
  const s = game.seats[seat]
  if (route === null) return `Score ${s.left} to make it.`
  return `Hit ${route.join(' then ')} to make it and move up to ${s.target + 1}.`
}

/** 3-dart groups of pips for the open try: 'used' (committed visits), 'current' (thrown in the
 *  open visit), 'open' (not thrown). */
export function p121Pips(game: P121Game, seat: number, visitDarts: number): ('used' | 'current' | 'open')[][] {
  const { dartsPerTry } = game.cfg
  const used = game.seats[seat].darts
  const pips: ('used' | 'current' | 'open')[] = Array.from({ length: dartsPerTry }, (_, i) =>
    i < used ? 'used' : i < used + visitDarts ? 'current' : 'open',
  )
  const groups: ('used' | 'current' | 'open')[][] = []
  for (let i = 0; i < pips.length; i += 3) groups.push(pips.slice(i, i + 3))
  return groups
}

/** The banner after a try: made or missed, for the seat the result belongs to; null otherwise. */
export function p121Banner(game: P121Game, seat: number): { kind: 'made' | 'missed'; text: string } | null {
  const r = game.lastResult
  if (!r || r.seat !== seat) return null
  if (r.made) return { kind: 'made', text: `Checked out ${r.target} in ${plural(r.darts, 'dart')} · next ${r.next}` }
  return { kind: 'missed', text: r.next === r.target ? `Missed ${r.target} · again` : `Missed ${r.target} · back to ${r.next}` }
}
