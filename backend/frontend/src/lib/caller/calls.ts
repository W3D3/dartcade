// What the caller says, decided from the previous and the new snapshot. The server decides the
// game; this only picks words. A visit is called once, when it's over (see visitOver).

import type { X01Game } from '$lib/api/game-ws'
import { visitOver } from '../heldScore.js'

export type CallGame = Pick<
  X01Game,
  | 'scores'
  | 'legs'
  | 'firstTo'
  | 'currentPlayer'
  | 'phase'
  | 'bustThisVisit'
  | 'visitLocked'
  | 'currentVisitDarts'
  | 'visitStartScores'
  | 'totalVisits'
  | 'teams'
>

/** Parts said in order; each part lists keys by preference (the first the pack has plays). */
export type Call = string[][]

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
// What the visit took off the score, not the dart faces: darts before a double/master in score nothing.
const visitTotal = (g: CallGame) => (g.visitStartScores[g.currentPlayer] ?? 0) - g.scores[g.currentPlayer]
const legsPlayed = (g: CallGame) => (g.teams ? sum(g.teams.map(t => t.legs)) : sum(g.legs))
const legsOf = (g: CallGame, seat: number) => {
  const teamLegs = g.teams?.find(t => t.seats.includes(seat))?.legs
  return teamLegs !== undefined ? teamLegs : g.legs[seat] || 0
}

export function callsFor(before: CallGame | null, after: CallGame): Call {
  if (before === null) {
    if (after.phase === 'bulloff') return [['bulling_start']]
    const pristine =
      after.phase === 'game' && sum(after.totalVisits) === 0 && after.currentVisitDarts.length === 0 && legsPlayed(after) === 0
    return pristine ? [['gameon']] : []
  }
  if (after.phase === 'bulloff') return before.phase === 'bulloff' ? [] : [['bulling_start']]
  if (before.phase === 'bulloff') return after.phase === 'game' ? [['gameon']] : []
  if (before.phase !== 'game') return []

  const wasOver = visitOver(before.visitLocked, before.currentVisitDarts.length)
  if (wasOver) {
    // A correction in a visit that is already over: if the visit wasn't committed and is still over
    // for the same player, compare the calls; if they differ, announce the new one.
    const committed = sum(after.totalVisits) > sum(before.totalVisits)
    if (!committed && after.currentPlayer === before.currentPlayer && visitOver(after.visitLocked, after.currentVisitDarts.length)) {
      const beforeCall = endOfVisit(before)
      const afterCall = endOfVisit(after)
      if (JSON.stringify(beforeCall) !== JSON.stringify(afterCall)) return afterCall
    }
    return []
  }
  const committed = sum(after.totalVisits) > sum(before.totalVisits)
  if (committed) return [[String(visitTotal(before))]]
  const sameVisit = after.currentPlayer === before.currentPlayer
  if (sameVisit && visitOver(after.visitLocked, after.currentVisitDarts.length)) return endOfVisit(after)
  return []
}

function endOfVisit(g: CallGame): Call {
  if (g.bustThisVisit) return [['busted']]
  const cp = g.currentPlayer
  if (g.visitLocked && g.scores[cp] === 0) {
    if (legsOf(g, cp) + 1 >= g.firstTo) return [['matchshot', 'gameshot']]
    // Legs count up at the takeout, so g still has the old count: this is the leg just won
    return [['gameshot'], [`leg_${legsPlayed(g) + 1}`]]
  }
  return [[String(visitTotal(g))]]
}

/** One clip per part: the first key the pack has, a random variant of it. Missing parts are skipped. */
export function pickClips<T>(
  call: Call,
  clips: Record<string, T[]>,
  pick: (n: number) => number = n => Math.floor(Math.random() * n),
): T[] {
  const out: T[] = []
  for (const part of call) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const key = part.find(k => (clips[k]?.length ?? 0) > 0)
    if (key !== undefined) out.push(clips[key][pick(clips[key].length)])
  }
  return out
}
