// The meta line next to the game title in the header.
import type { AtcGame, X01Game } from '../api/game-ws'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function x01Meta(game: X01Game, playerCount: number): string {
  const cfg = game.config
  const { legs, firstTo } = game
  const played = legs.reduce((a, b) => a + b, 0)
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(String(cfg.startScore))
  if (cfg.inMode !== 'straight') parts.push(`${cap(cfg.inMode)} in`)
  parts.push(`${cap(cfg.outMode)} out`)
  parts.push(playerCount === 1 ? 'Practice' : `First to ${firstTo} ${firstTo === 1 ? 'leg' : 'legs'}`)
  // After the match: the leg in play when it ended (a won final leg, or one cut short by the round limit)
  const winner = game.winner
  const finalLegWon = winner !== null && (legs.at(winner) ?? 0) >= firstTo
  parts.push(`Leg ${finalLegWon ? played : played + 1}`)
  return parts.join(' · ')
}

export function atcMeta(game: AtcGame, playerCount: number): string {
  const { cfg, sequence: seq, totalVisits } = game
  const round = totalVisits.length ? Math.min(...totalVisits) + 1 : 1
  const order = cfg.order === 'desc' ? '20–1' : cfg.order === 'random' ? 'Random order' : '1–20'
  const bull = seq.includes(22) ? ', then Bull' : seq.includes(21) ? ', then 25' : ''
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(order + bull)
  if (playerCount === 2) parts.push(cfg.multiplierAdvances ? 'multiplier advances' : 'any segment counts')
  if (playerCount === 1) parts.push('Practice')
  parts.push(`Round ${round}`)
  return parts.join(' · ')
}
