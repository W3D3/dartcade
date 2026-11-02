// A seat's darts in a finished X01 game, with what was left before each, for the coach. Reads the
// stored detail (games/x01.ts detail()): each visit's remaining is after it, unchanged on a bust.
import { nextVisit } from './model.js'
import { visitStart } from './visitStart.js'

export type CoachDart = { segment: { name: string; number: number; multiplier: number }; coords: { x: number; y: number } | null }
export type CoachVisit = { seat: number; darts: readonly CoachDart[]; scored: number; remaining: number; bust: boolean }
export type CoachLeg = { leg: number; visits: readonly CoachVisit[] }

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
  visitDarts: readonly CoachDart[]
  checkout: boolean
  bust: boolean
  /** The chance of a next visit: every opponent fails to check out first */
  w: number
}

// The bull comes as number 50 with multiplier 1, a miss as multiplier 0
export const dartPoints = (d: CoachDart): number => d.segment.number * d.segment.multiplier
export const isDoubleDart = (d: CoachDart): boolean => d.segment.multiplier === 2 || d.segment.number === 50

/** Every dart `seat` threw, leg by leg. `startScore` is the game's start, for opponents yet to throw. */
export function throwsOf(legs: readonly CoachLeg[], seat: number, startScore: number): Throw[] {
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
      let left = start
      // The game keeps darts thrown after a bust; they score nothing, so the walk stops at the bust
      for (const [i, d] of v.darts.entries()) {
        const after = left - dartPoints(d)
        const checkout = after === 0 && isDoubleDart(d)
        const bust = !checkout && after < 2
        out.push({ leg: l.leg, visit: vi, dart: i, start, left, darts: 3 - i, d, visitDarts: v.darts, checkout, bust, w })
        if (bust) break
        left = after
      }
    })
  }
  return out
}
