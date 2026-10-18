import type { Trigger } from '../../shared/lights/index.js'

type Common = { currentPlayer: number; winner: number | null; phase?: string }

/** Turn, win and bull-off triggers, the same in every game. */
export function commonTriggers(before: Common | null, after: Common): Trigger[] {
  if (after.winner !== null) return before === null || before.winner === null ? [{ kind: 'game.won', seat: after.winner }] : []
  const out: Trigger[] = []
  const leftBullOff = before?.phase === 'bulloff' && after.phase !== 'bulloff'
  if (leftBullOff) out.push({ kind: 'bulloff.won', seat: after.currentPlayer })
  if (before === null || before.currentPlayer !== after.currentPlayer || leftBullOff) out.push({ kind: 'turn', seat: after.currentPlayer })
  return out
}
