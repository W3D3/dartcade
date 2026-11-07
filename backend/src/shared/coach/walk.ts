// A seat's darts in a finished X01 game, with what was left before each, for the coach. Reads the
// stored detail (games/x01.ts detail()): each visit's remaining is after it, unchanged on a bust.
import { R, segmentAt, withoutFalsePosition, type Bed } from '../board.js'
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
  /** The score after it: 0 on a checkout, the visit's start on a bust */
  after: number
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
export const dartPoints = (d: Pick<CoachDart, 'segment'>): number => d.segment.number * d.segment.multiplier
export const isDoubleDart = (d: Pick<CoachDart, 'segment'>): boolean => d.segment.multiplier === 2 || d.segment.number === 50

/** The number a dart landed in: 1–20, 25 for the bull and 25, or null for a miss we can't place. */
export function landedNumber(d: CoachDart): number | null {
  const { number, multiplier } = d.segment
  if (number === 50 || number === 25) return 25
  if (multiplier > 0 && number >= 1 && number <= 20) return number
  if (!d.coords) return null
  const s = segmentAt(d.coords.x, d.coords.y)
  return s.number === 50 ? 25 : s.number
}

/** A single that may have been thrown at the bull or 25: it landed inside the inner single ring, or
 *  it has no position to tell. */
export const nearBull = (d: CoachDart): boolean =>
  d.segment.multiplier === 1 &&
  d.segment.number >= 1 &&
  d.segment.number <= 20 &&
  (d.coords === null || Math.hypot(d.coords.x, d.coords.y) < R.si)

/** The score after a dart worth `points` from `left`, double out: 'out' on 0 with a double, 'bust'
 *  below 2 or on 0 without one. */
export function afterDart(left: number, points: number, double: boolean): number | 'out' | 'bust' {
  const after = left - points
  return after === 0 && double ? 'out' : after < 2 ? 'bust' : after
}

/** The score a dart leaves (afterDart's `after`): 0 on a checkout, the visit's `start` again on a bust */
export const settle = (after: number | 'out' | 'bust', start: number): number => (after === 'out' ? 0 : after === 'bust' ? start : after)

/** The most a dart scores: a treble 20 */
const MAX_DART = 60
/** How a dart is judged, by the score left before it and the darts left in its visit: `finish`, on
 *  170 or less, by the checkout chances (model.ts); `leave`, the visit's last dart with more than 170
 *  left but a treble 20 from 170 or less, by its leave (notes.ts leaveCost), since there the checkout
 *  chances are all too small to tell aims apart; else `scoring`, by its score. */
export type DartPhase = 'scoring' | 'leave' | 'finish'
export const dartPhase = (t: Pick<Throw, 'left' | 'darts'>): DartPhase =>
  t.left <= 170 ? 'finish' : t.darts === 1 && t.left <= 170 + MAX_DART ? 'leave' : 'scoring'
export const onFinish = (t: Pick<Throw, 'left' | 'darts'>): boolean => dartPhase(t) === 'finish'

export type Step = Pick<Throw, 'left' | 'after' | 'checkout' | 'bust'>

/** A visit's darts from `start`, up to and including the one that busts: the score before and
 *  after each, and whether it checked out or busted. The game keeps darts thrown after a bust; they
 *  score nothing, so the walk stops there. */
export function walkVisit(start: number, darts: readonly CoachDart[]): Step[] {
  const out: Step[] = []
  let left = start
  for (const d of darts) {
    const after = afterDart(left, dartPoints(d), isDoubleDart(d))
    out.push({ left, after: settle(after, start), checkout: after === 'out', bust: after === 'bust' })
    if (typeof after !== 'number') break
    left = after
  }
  return out
}

/** Every dart `seat` threw, leg by leg. `startScore` is the game's start, for opponents yet to throw.
 *  The opponents' checkout chances (w) are `model`'s too: they're taken to play at the coached tier. */
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
      for (const [i, step] of walkVisit(start, v.darts).entries())
        out.push({
          leg: l.leg,
          visit: vi,
          dart: i,
          start,
          ...step,
          darts: 3 - i,
          d: v.darts[i],
          w,
          opponentOnOut,
        })
    })
  }
  return out
}
