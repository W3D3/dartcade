import type { AtcGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<AtcGame, 'currentPlayer' | 'targets' | 'currentVisitHits'>
const hits = (g: V) => g.currentVisitHits.filter(Boolean).length

export function atcTriggers(before: V | null, after: V): Trigger[] {
  if (before === null || before.currentPlayer !== after.currentPlayer || hits(after) <= hits(before)) return []
  return [{ kind: 'atc.hit', seat: after.currentPlayer, target: before.targets[before.currentPlayer] }]
}
