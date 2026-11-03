// A seat's darts in a finished X01 game, with what was left before each, for the coach. Reads the
// stored detail (games/x01.ts detail()): each visit's remaining is after it, unchanged on a bust.
import { withoutFalsePosition, type Bed } from '../board.js'
import type { CoachModel } from './model.js'
import { visitStart } from './visitStart.js'

export type CoachDart = { segment: { name: string; number: number; multiplier: number }; coords: { x: number; y: number } | null }

/** A stored or live dart as the coach reads it: no position for a bounce-out or a miss on the
 *  board, which Board Manager has placed at the board's centre (board.ts withoutFalsePosition). */
export function coachDart(d: {
  segment: CoachDart['segment'] & { bed: Bed }
  coords?: { x: number; y: number } | null
  bouncer?: boolean
}): CoachDart {
  const { name, number, multiplier } = d.segment
  const kept = withoutFalsePosition({ segment: d.segment, coords: d.coords ?? undefined, bouncer: d.bouncer })
  return { segment: { name, number, multiplier }, coords: 'coords' in kept && kept.coords ? { x: kept.coords.x, y: kept.coords.y } : null }
}
export type CoachVisit = { seat: number; darts: readonly CoachDart[]; scored: number; remaining: number; bust: boolean }
export type CoachLeg = { leg: number; visits: readonly CoachVisit[]; winner?: number | null }

export type Throw = {
  leg: number
  /** Index in the leg's visits */
  visit: number
  /** 0–2 */
  dart: number
  /** The score when the visit started */
  start: number
  /** The score before this dart */
  left: number
  /** Darts left in the visit, this one included */
  darts: number
  d: CoachDart
  checkout: boolean
  bust: boolean
  /** The chance of a next visit: every opponent fails to check out first */
  w: number
  /** Any opponent's score left (the same source as w) can be checked out in three darts */
  opponentOnOut: boolean
}

// The bull comes as number 50 with multiplier 1, a miss as multiplier 0
export const dartPoints = (d: CoachDart): number => d.segment.number * d.segment.multiplier
export const isDoubleDart = (d: CoachDart): boolean => d.segment.multiplier === 2 || d.segment.number === 50

/** A visit's darts from `start`, up to and including the one that busts: the score before each,
 *  and whether it checked out or busted. The game keeps darts thrown after a bust; they score
 *  nothing, so the walk stops there. */
export function walkVisit(start: number, darts: readonly CoachDart[]): { left: number; checkout: boolean; bust: boolean }[] {
  const out: { left: number; checkout: boolean; bust: boolean }[] = []
  let left = start
  for (const d of darts) {
    const after = left - dartPoints(d)
    const checkout = after === 0 && isDoubleDart(d)
    const bust = !checkout && after < 2
    out.push({ left, checkout, bust })
    if (bust) break
    left = after
  }
  return out
}

/** Every dart `seat` threw, leg by leg. `startScore` is the game's start, for opponents yet to throw.
 *  The opponents' checkout chances (w) are `model`'s too: they're taken to play at the coached level. */
export function throwsOf(legs: readonly CoachLeg[], seat: number, startScore: number, { nextVisit }: CoachModel): Throw[] {
  const out: Throw[] = []
  for (const l of legs) {
    // Each other seat's score so far in this leg
    const scores = new Map<number, number>()
    const opponents = [...new Set(l.visits.map(v => v.seat).filter(s => s !== seat))]
    l.visits.forEach((v, vi) => {
      if (v.seat !== seat) {
        scores.set(v.seat, v.remaining)
        return
      }
      const start = visitStart(v)
      // An opponent who hasn't thrown in this leg yet is still on the start score
      const w = opponents.reduce((p, o) => p * (1 - nextVisit(scores.get(o) ?? startScore)), 1)
      const opponentOnOut = opponents.some(o => nextVisit(scores.get(o) ?? startScore) > 0)
      for (const [i, { left, checkout, bust }] of walkVisit(start, v.darts).entries())
        out.push({
          leg: l.leg,
          visit: vi,
          dart: i,
          start,
          left,
          darts: 3 - i,
          d: v.darts[i],
          checkout,
          bust,
          w,
          opponentOnOut,
        })
    })
  }
  return out
}
