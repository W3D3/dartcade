// The meta line next to the game title in the header.
import type { AtcGame, X01Game } from '../api/game-ws'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export type Mode = 'straight' | 'double' | 'master'
export type X01Rules = { startScore: number; inMode: Mode; outMode: Mode; firstTo: number }
export type AtcRules = { order: 'asc' | 'desc' | 'random'; finishOn: 'twenty' | 'single_bull' | 'bull'; multiplierAdvances: boolean }

/** The X01 rules as one line, e.g. "501 · Double out · First to 3 legs". */
export function x01Rules(r: X01Rules, playerCount: number): string {
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(String(r.startScore))
  if (r.inMode !== 'straight') parts.push(`${cap(r.inMode)} in`)
  parts.push(`${cap(r.outMode)} out`)
  parts.push(playerCount === 1 ? 'Practice' : `First to ${r.firstTo} ${r.firstTo === 1 ? 'leg' : 'legs'}`)
  return parts.join(' · ')
}

/** The Around the Clock rules as one line, e.g. "1–20, then Bull · any segment counts". */
export function atcRules(r: AtcRules, playerCount: number): string {
  const order = r.order === 'desc' ? '20–1' : r.order === 'random' ? 'Random order' : '1–20'
  const bull = r.finishOn === 'bull' ? ', then Bull' : r.finishOn === 'single_bull' ? ', then 25' : ''
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(order + bull)
  if (playerCount === 2) parts.push(r.multiplierAdvances ? 'multiplier advances' : 'any segment counts')
  if (playerCount === 1) parts.push('Practice')
  return parts.join(' · ')
}

export function x01Meta(game: X01Game, playerCount: number): string {
  const { legs, firstTo, winner } = game
  const played = legs.reduce((a, b) => a + b, 0)
  // After the match: the leg in play when it ended (a won final leg, or one cut short by the round limit)
  const finalLegWon = winner !== null && (legs.at(winner) ?? 0) >= firstTo
  return `${x01Rules({ ...game.config, firstTo }, playerCount)} · Leg ${finalLegWon ? played : played + 1}`
}

export function atcMeta(game: AtcGame, playerCount: number): string {
  const round = game.totalVisits.length ? Math.min(...game.totalVisits) + 1 : 1
  return `${atcRules(game.cfg, playerCount)} · Round ${round}`
}
