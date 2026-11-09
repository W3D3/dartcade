import type { CricketGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<CricketGame, 'marks' | 'currentPlayer'>

const CLOSED = 3

/** The thrower closes a number: its team's marks on a target reach three. */
export function cricketTriggers(before: V | null, after: V): Trigger[] {
  if (before === null) return []
  const seat = before.currentPlayer
  const was = before.marks[seat]
  return after.marks[seat].flatMap((m, target) => (m >= CLOSED && was[target] < CLOSED ? [{ kind: 'cricket.closed' as const, seat }] : []))
}
