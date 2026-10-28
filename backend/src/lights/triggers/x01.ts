import type { X01Game } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'
import { visitOutcome } from '../../shared/visitOutcome.js'

type V = Pick<
  X01Game,
  | 'phase'
  | 'currentPlayer'
  | 'scores'
  | 'visitStartScores'
  | 'bustThisVisit'
  | 'visitLocked'
  | 'currentVisitDarts'
  | 'totalVisits'
  | 'legs'
  | 'firstTo'
  | 'teams'
>

// A visit lights once, when it's over, read the way the caller reads it (shared/visitOutcome.ts)
export function x01Triggers(before: V | null, after: V): Trigger[] {
  const o = visitOutcome(before, after)
  if (o === null) return []
  if (o.kind === 'checkout') return [{ kind: o.match ? 'game.won' : 'checkout', seat: o.seat }]
  return [o]
}
