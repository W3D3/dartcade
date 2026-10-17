// Pure view helpers for Higher Lower: the header meta line, the needs line, the high hint, the
// outcome and banner texts, and which zone a total sits in. Fed by the HiloGame snapshot; see
// docs/superpowers/specs/2026-10-17-higher-lower-design.md.
import type { HiloGame, HiloResult } from '../api/game-ws'
import { plural } from '../fmt.js'

export type HiloOutcome = HiloResult['outcome']

/** "2 players · 3 lives · Round 4". */
export function hiloMeta(game: HiloGame, players: number): string {
  return `${plural(players, 'player')} · ${plural(game.cfg.lives, 'life', 'lives')} · Round ${game.round}`
}

/** "Over 60 · under 15". */
export function needsLine(game: HiloGame): string {
  return `Over ${game.high} · under ${game.low}`
}

/**
 * The smallest total for the darts left in this visit that beats the high bar
 * (`high + 1 - visitTotal`); null when it's out of reach (more than 60 per dart left) or the
 * visit is already safe high. With `matchExtremes` on and the high bar at 180, the bar can
 * only be matched, never beaten, so there's never a hint.
 */
export function highHint(game: HiloGame, dartsThrown: number): { need: number; label: string } | null {
  const need = game.high + 1 - game.visitTotal
  const dartsLeft = 3 - dartsThrown
  if (need <= 0 || need > 60 * dartsLeft) return null
  return { need, label: `${need}+ · beats HIGH ${game.high}` }
}

/** 'Set HIGH 60' | 'Set LOW 7' | 'Lost a life · 45' | 'Missed the board'. */
export function outcomeText(v: { total: number; outcome: HiloOutcome }): string {
  if (v.outcome === 'high') return `Set HIGH ${v.total}`
  if (v.outcome === 'low') return `Set LOW ${v.total}`
  if (v.outcome === 'miss') return 'Missed the board'
  return `Lost a life · ${v.total}`
}

/**
 * '−1 life · 45 is between 15 and 60' | '−1 life · missed the board'; null for high/low (no
 * life lost, so no banner).
 */
export function bannerText(r: NonNullable<HiloGame['lastResult']>): string | null {
  if (r.outcome === 'miss') return '−1 life · missed the board'
  if (r.outcome === 'between') return `−1 life · ${r.total} is between ${r.low} and ${r.high}`
  return null
}

/** Which zone a total sits in, by the same rule the engine judges a visit with (safeHigh/judge in backend/src/games/hilo.ts). */
export function zoneOf(total: number, game: HiloGame): 'safe-high' | 'safe-low' | 'danger' {
  const { high, low } = game
  const { matchExtremes } = game.cfg
  if (total > high || (matchExtremes && high === 180 && total === 180)) return 'safe-high'
  if (total < low || (matchExtremes && low === 0 && total === 0)) return 'safe-low'
  return 'danger'
}
