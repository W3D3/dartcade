// What the caller says, decided from the previous and the new snapshot. The server decides the
// game; this only picks words. How a visit ended is read in $shared/visitOutcome (the lights read it too).

import type { Snapshot, X01Game } from '$lib/api/game-ws'
import { canCheckOut } from '$shared/checkout.js'
import { committed, isOver, legsPlayed, visitEnd, visitOutcome, type VisitOutcome } from '$shared/visitOutcome.js'

export { legsOf } from '$shared/visitOutcome.js'

type VisitGame = Pick<X01Game, 'currentPlayer' | 'phase' | 'bustThisVisit' | 'visitLocked' | 'currentVisitDarts' | 'totalVisits'> &
  Partial<Pick<X01Game, 'legs' | 'firstTo' | 'teams'>>
/** A score counting down to 0 (X01, 121 Checkout): the visit is what it took off, 0 is a checkout. */
type CountdownGame = VisitGame &
  Pick<X01Game, 'scores' | 'visitStartScores'> & { config: Pick<X01Game['config'], 'outMode'> & Partial<X01Game['config']> }
/** A visit total counting up (Higher Lower): no checkout to call. */
type TallyGame = VisitGame & { visitTotal: number }
/** What the caller reads of a game: X01's own fields; other score-based modes are read into them by callGame. */
export type CallGame = CountdownGame | TallyGame

/** The caller's view of a score-based game (the snapshot's `scoreBased`); null for a mode without a score to call. */
export function callGame(s: Snapshot): CallGame | null {
  switch (s.gameId) {
    case 'x01':
      return s.game
    case 'p121': {
      const g = s.game
      const scores = g.seats.map(x => x.left)
      const visitStartScores = scores.map((left, i) => (i === g.currentPlayer ? g.visitStartLeft : left))
      return { ...g, scores, visitStartScores, bustThisVisit: g.bust, config: { outMode: g.cfg.outMode } }
    }
    case 'hilo':
      // A missed dart ends the visit and costs a life: called like a bust
      return { ...s.game, bustThisVisit: s.game.visitLocked }
    case 'atc':
    case 'minigolf':
      return null
  }
}

/** Parts said in order; each part lists choices by preference: a key, or a phrase (keys said one
 *  after another) that plays only when the voice has every one of them. */
export type Call = (string | string[])[][]

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

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

  if (isOver(before)) {
    // A correction in a visit that is already over: if the visit wasn't committed and is still over
    // for the same player, compare the calls; if they differ, announce the new one.
    if (!committed(before, after) && after.currentPlayer === before.currentPlayer && isOver(after)) {
      const beforeCall = callOf(visitEnd(before))
      const afterCall = callOf(visitEnd(after))
      if (JSON.stringify(beforeCall) !== JSON.stringify(afterCall)) return afterCall
    }
    return []
  }
  const outcome = visitOutcome(before, after)
  return outcome ? callOf(outcome) : []
}

function callOf(o: VisitOutcome): Call {
  switch (o.kind) {
    case 'bust':
      // Prefer a dedicated "busted" clip; a voice without one (e.g. most Autodarts packs) falls back
      // to its own "No score" clip, same as the real Autodarts caller does on a bust.
      return [['busted', '0']]
    case 'checkout':
      // A game without legs (121 Checkout): the target made, nothing more to say
      if (o.leg === null) return [['gameshot']]
      return o.match ? [['matchshot', 'gameshot']] : [['gameshot'], ['and'], [`leg_${o.leg}`]]
    case 'visit':
      return [[String(o.total)]]
  }
}

/** What the next thrower needs and in which leg, when they can finish it. */
export type Checkout = { seat: number; remaining: number; leg: number }

/** At the takeout: what the next thrower needs, when they can finish it in one visit. Null when no
 *  visit was committed (an undo or a correction), at a new leg or the end, and on a fresh page. */
export function checkoutFor(before: CallGame | null, after: CallGame): Checkout | null {
  if (before?.phase !== 'game' || after.phase !== 'game' || !('scores' in after)) return null
  if (!committed(before, after)) return null
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
