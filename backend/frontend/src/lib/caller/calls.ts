// What the caller says, decided from the previous and the new snapshot. The server decides the
// game; this only picks words. A visit is called once, when it's over (see visitOver).

import type { X01Game } from '$lib/api/game-ws'
import { visitOver } from '../heldScore.js'
import { canCheckOut } from '$shared/checkout.js'

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
  | 'config'
>

/** Parts said in order; each part lists choices by preference: a key, or a phrase (keys said one
 *  after another) that plays only when the voice has every one of them. */
export type Call = (string | string[])[][]

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
    return [['gameshot'], ['and'], [`leg_${legsPlayed(g) + 1}`]]
  }
  return [[String(visitTotal(g))]]
}

/** What the next thrower needs and in which leg, when they can finish it. */
export type Checkout = { seat: number; remaining: number; leg: number }

/** At the takeout: what the next thrower needs, when they can finish it in one visit. Null when no
 *  visit was committed (an undo or a correction), at a new leg or the end, and on a fresh page. */
export function checkoutFor(before: CallGame | null, after: CallGame): Checkout | null {
  if (before?.phase !== 'game' || after.phase !== 'game') return null
  if (sum(after.totalVisits) <= sum(before.totalVisits)) return null
  const leg = legsPlayed(after)
  if (leg !== legsPlayed(before)) return null
  const seat = after.currentPlayer
  const remaining = after.teams?.find(t => t.seats.includes(seat))?.score ?? after.scores[seat]
  return canCheckOut(remaining, after.config.outMode) ? { seat, remaining, leg } : null
}

/** "You require N": the whole phrase, else the lead-in and the number. */
export const requirePart = (n: number): (string | string[])[] => [`require_${n}`, ['you_require', String(n)]]

/** Whether to say a checkout call: with `repeat` off, not again for a seat whose score is the one
 *  last announced for it in this leg (after a bust or a no-score visit). Remembers what it lets through. */
export function createCheckoutMemory(): (c: Checkout, repeat: boolean) => boolean {
  let leg = -1
  const said = new Map<number, number>()
  return (c, repeat) => {
    if (c.leg !== leg) {
      said.clear()
      leg = c.leg
    }
    if (!repeat && said.get(c.seat) === c.remaining) return false
    said.set(c.seat, c.remaining)
    return true
  }
}

/** One clip per key of the first choice the voice has, a random variant of each. Missing parts are skipped. */
export function pickClips<T>(
  call: Call,
  clips: Record<string, T[]>,
  pick: (n: number) => number = n => Math.floor(Math.random() * n),
): T[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const has = (k: string) => (clips[k]?.length ?? 0) > 0
  const out: T[] = []
  for (const part of call) {
    const choice = part.find(c => (typeof c === 'string' ? has(c) : c.every(has)))
    if (choice === undefined) continue
    for (const k of typeof choice === 'string' ? [choice] : choice) out.push(clips[k][pick(clips[k].length)])
  }
  return out
}
