import type { MissionDart } from '../shared/missions/types.js'

/** A dart from its label: S20, D20, T20, B (outer bull), DB (inner bull), M (miss). */
export function dart(label: string): MissionDart {
  if (label === 'M') return { number: 0, multiplier: 0, score: 0 }
  if (label === 'B') return { number: 25, multiplier: 1, score: 25 }
  if (label === 'DB') return { number: 50, multiplier: 1, score: 50 }
  const m = { S: 1, D: 2, T: 3 }[label[0]] ?? 1
  const n = Number(label.slice(1))
  return { number: n, multiplier: m, score: n * m }
}
