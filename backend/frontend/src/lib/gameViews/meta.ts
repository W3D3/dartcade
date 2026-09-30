// The meta line next to the game title in the header.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function x01Meta(game: Record<string, unknown>, playerCount: number): string {
  const cfg = (game.config ?? {}) as { startScore?: number; outMode?: string; inMode?: string }
  const legs = (game.legs as number[] | undefined) ?? []
  const firstTo = (game.firstTo as number | undefined) ?? 1
  const played = legs.reduce((a, b) => a + b, 0)
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(String(cfg.startScore ?? 501))
  if (cfg.inMode && cfg.inMode !== 'straight') parts.push(`${cap(cfg.inMode)} in`)
  parts.push(`${cap(cfg.outMode ?? 'double')} out`)
  parts.push(playerCount === 1 ? 'Practice' : `First to ${firstTo} ${firstTo === 1 ? 'leg' : 'legs'}`)
  // Once the match is won the last leg is the one that was just played
  parts.push(`Leg ${game.winner === null || game.winner === undefined ? played + 1 : played}`)
  return parts.join(' · ')
}

export function atcMeta(game: Record<string, unknown>, playerCount: number): string {
  const cfg = (game.cfg ?? {}) as { order?: string; multiplierAdvances?: boolean }
  const seq = (game.sequence as number[] | undefined) ?? []
  const totalVisits = (game.totalVisits as number[] | undefined) ?? []
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
