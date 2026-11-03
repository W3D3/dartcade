// A visit's darts by what each did to the position's value: the best aim's value (model.ts) before
// the dart against after it, for the reference player. The visit's deltas sum to its end's value
// against its start's: 1 after a checkout, w · nextVisit of the score left (the start after a bust).
import { nextVisit, type Evaluation } from './model.js'
import { dartPoints, type Throw } from './walk.js'

/** The value before each of one visit's walked darts, then after its last. `evaluate` is the
 *  leg's throwEvaluations (notes.ts): the darts share their visit's evaluator. */
export function visitValues(throws: readonly Throw[], evaluate: (t: Throw) => Evaluation | null): number[] {
  const last = throws.at(-1)
  if (!last) return []
  const value = (t: Throw) => {
    const e = evaluate(t)
    if (!e) throw new Error('visitValues: a dart on more than 170 has no value')
    return Math.max(...e.values)
  }
  const after = last.left - dartPoints(last.d)
  const end = last.checkout
    ? 1
    : last.bust
      ? last.w * nextVisit(last.start)
      : last.darts > 1
        ? // Darts still to come (the sandbox's visit in progress): the next dart's value
          value({ ...last, dart: last.dart + 1, left: after, darts: last.darts - 1 })
        : last.w * nextVisit(after)
  return [...throws.map(value), end]
}

/** Each walked dart's change in value, in percentage points (+ better than the reference player
 *  expects from there). */
export function dartDeltas(throws: readonly Throw[], evaluate: (t: Throw) => Evaluation | null): number[] {
  const v = visitValues(throws, evaluate)
  return throws.map((_, i) => (v[i + 1] - v[i]) * 100)
}
