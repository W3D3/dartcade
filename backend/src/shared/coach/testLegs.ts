// Builds X01 legs for the coach's tests the way the game stores them (games/x01.ts detail()).
import { LANDING } from './landing/level-7.gen.js'
import { coachModel } from './model.js'
import type { CoachDart, CoachLeg, CoachVisit } from './walk.js'

/** Level 7's model (81 average), loaded without waiting: what the tests' numbers were pinned on */
export const REF = coachModel(7, LANDING)

export function seg(name: string): CoachDart['segment'] {
  if (name === 'Bull') return { name, number: 50, multiplier: 1 }
  if (name === '25') return { name, number: 25, multiplier: 1 }
  if (name === 'Miss') return { name, number: 0, multiplier: 0 }
  const first = name[0]
  const m = first === 'S' ? 1 : first === 'D' ? 2 : 3
  return { name, number: Number(name.slice(1)), multiplier: m }
}

export const dart = (name: string, coords: CoachDart['coords'] = null): CoachDart => ({ segment: seg(name), coords })

/** A visit by `seat` from `start`. Like the game, it keeps the darts given after a bust (they score
 *  nothing) and stops at a checkout. */
export function visit(seat: number, start: number, names: string[]): CoachVisit {
  let left = start
  let bust = false
  const darts: CoachDart[] = []
  for (const n of names) {
    const d = dart(n)
    darts.push(d)
    if (bust) continue
    const after = left - d.segment.number * d.segment.multiplier
    const double = d.segment.multiplier === 2 || d.segment.number === 50
    if (after < 0 || after === 1 || (after === 0 && !double)) {
      bust = true
      continue
    }
    left = after
    if (left === 0) break
  }
  return { seat, darts, scored: bust ? 0 : start - left, remaining: bust ? start : left, bust }
}

export const leg = (visits: CoachVisit[], n = 0): CoachLeg => ({ leg: n, visits })
