// A visit's darts by what each did to the position's value: the best aim's value (model.ts) before
// the dart against after it, for a player of the coaching level. The visit's deltas sum to its end's value
// against its start's: 1 after a checkout, w · nextVisit of the score left (the start after a bust).
import type { CoachModel, Evaluation } from './model.js'
import type { Throw } from './walk.js'

/** The value before each of one visit's walked darts, then after its last. `evaluate` is the
 *  leg's throwEvaluations (notes.ts): the darts share their visit's evaluator. */
export function visitValues(throws: readonly Throw[], evaluate: (t: Throw) => Evaluation | null, { nextVisit }: CoachModel): number[] {
  const last = throws.at(-1)
  if (!last) return []
  const value = (t: Throw) => {
    const e = evaluate(t)
    if (!e) throw new Error('visitValues: a dart on more than 170 has no value')
    return Math.max(...e.values)
  }
  const end = last.checkout
    ? 1
    : last.bust
      ? last.w * nextVisit(last.start)
      : last.darts > 1
        ? // Darts still to come (an open visit): the next dart's value
          value({ ...last, dart: last.dart + 1, left: last.after, darts: last.darts - 1 })
        : last.w * nextVisit(last.after)
  return [...throws.map(value), end]
}

/** Each walked dart's change in value, in percentage points (+ better than a player of the
 *  model's level expects from there). */
export function dartDeltas(throws: readonly Throw[], evaluate: (t: Throw) => Evaluation | null, model: CoachModel): number[] {
  return deltasOf(visitValues(throws, evaluate, model))
}

/** visitValues' changes, in percentage points */
export const deltasOf = (v: readonly number[]): number[] => v.slice(1).map((x, i) => (x - v[i]) * 100)
