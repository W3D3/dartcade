// The coach's checkout model, for the reference player (landing.gen.ts), double out, bull 25/50:
// how likely each aim is to lead to a checkout this visit, or in the next one weighted by the
// chance of getting it (w: the opponents don't check out first).
import type { Outcome } from './aims.js'
// LANDING follows AIMS' order, so the evaluator's values do too
import { LANDING } from './landing.gen.js'

function finishTable(): number[][] {
  const t = Array.from({ length: 171 }, () => [0, 0, 0, 0])
  for (let k = 1; k <= 3; k++) {
    for (let r = 2; r <= 170; r++) {
      let best = 0
      for (const outs of LANDING) {
        let v = 0
        for (const [, points, double, p] of outs) {
          const after = r - points
          if (after === 0 && double) v += p
          else if (after >= 2) v += p * t[after][k - 1]
        }
        if (v > best) best = v
      }
      t[r][k] = best
    }
  }
  return t
}

/** fin[r][k]: the chance to check out r (0–170) with at most k darts (0–3) this visit; a bust is a no. */
export const fin: readonly (readonly number[])[] = finishTable()

/** The chance to check out a score with a fresh visit: 0 outside 2–170. */
export const nextVisit = (score: number): number => (score >= 2 && score <= 170 ? fin[score][3] : 0)

export type OutcomeValue = { outcome: Outcome; after: number | 'bust' | 'out'; value: number }

export type Evaluation = {
  /** Each aim's value, in AIMS order */
  values: number[]
  /** How each way a dart at `aim` can land turns out, and what it is worth */
  outcomes(aim: number): OutcomeValue[]
}

/** Values within one visit that started on `start`, with w the chance of a next visit. Spots of
 *  the same visit share the evaluator, so they share its memo. */
export function evaluator(start: number, w: number): (left: number, darts: number) => Evaluation {
  const memo = new Map<number, number>()

  const outcome = (o: Outcome, left: number, darts: number): OutcomeValue => {
    const after = left - o[1]
    if (after === 0 && o[2]) return { outcome: o, after: 'out', value: 1 }
    // Below 0, on 1, or 0 without a double: the visit ends and the next starts where this one did
    if (after < 2) return { outcome: o, after: 'bust', value: w * nextVisit(start) }
    return { outcome: o, after, value: darts === 1 ? w * nextVisit(after) : best(after, darts - 1) }
  }
  const value = (aim: number, left: number, darts: number): number =>
    LANDING[aim].reduce((sum, o) => sum + o[3] * outcome(o, left, darts).value, 0)
  const best = (left: number, darts: number): number => {
    const key = left * 4 + darts
    let v = memo.get(key)
    if (v === undefined) {
      v = 0
      for (let a = 0; a < LANDING.length; a++) v = Math.max(v, value(a, left, darts))
      memo.set(key, v)
    }
    return v
  }

  return (left, darts) => ({
    values: LANDING.map((_, a) => value(a, left, darts)),
    outcomes: aim => LANDING[aim].map(o => outcome(o, left, darts)),
  })
}
