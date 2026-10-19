import type { X01Game } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

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

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const visitOver = (locked: boolean, darts: number) => locked || darts >= 3
const total = (g: V) => (g.visitStartScores[g.currentPlayer] ?? 0) - g.scores[g.currentPlayer]
// Mirrors the caller's legsOf (lib/caller/calls.ts): legs count up at the takeout, so `g` still has the old count here.
const legsOf = (g: V, seat: number) => {
  const teamLegs = g.teams?.find(t => t.seats.includes(seat))?.legs
  return teamLegs !== undefined ? teamLegs : g.legs[seat] || 0
}

// Mirrors the caller (lib/caller/calls.ts): a visit lights once, when it's over
export function x01Triggers(before: V | null, after: V): Trigger[] {
  if (before === null || before.phase !== 'game') return []
  if (visitOver(before.visitLocked, before.currentVisitDarts.length)) return []
  const seat = before.currentPlayer
  if (after.currentPlayer === seat && visitOver(after.visitLocked, after.currentVisitDarts.length)) {
    if (after.bustThisVisit) return [{ kind: 'bust', seat }]
    if (after.visitLocked && after.scores[seat] === 0) {
      // The match-shot test the caller uses: this checkout wins the match, not just the leg.
      const wonMatch = legsOf(after, seat) + 1 >= after.firstTo
      return [wonMatch ? { kind: 'game.won', seat } : { kind: 'checkout', seat }]
    }
    return [{ kind: 'visit', seat, total: total(after) }]
  }
  if (sum(after.totalVisits) > sum(before.totalVisits)) return [{ kind: 'visit', seat, total: total(before) }]
  return []
}
