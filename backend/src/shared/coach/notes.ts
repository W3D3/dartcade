// Strategy notes: a dart on a finish whose number was clearly worse than the best aim, judged with
// the benefit of the doubt (the best aim on the number it landed in).
import { checkoutHint } from '../checkout.js'
import { AIMS } from './aims.js'
import { candidates, landedNumber } from './aim.js'
import { evaluator, fin, type Evaluation, type Evaluator, type OutcomeValue } from './model.js'
import type { Throw } from './walk.js'

/** A note needs the better aim to give this much more checkout chance (5 points). */
export const NOTE_THRESHOLD = 0.05

export type CoachNote = {
  leg: number
  visit: number
  dart: number
  left: number
  darts: number
  /** The dart's segment name, Miss off the board */
  thrown: string
  /** The better aim's label: S17, 20/1, Bull */
  better: string
  /** Checkout chance lost, 0–1 */
  cost: number
  /** Why, when the worst way the dart can land says it; null for a plain "leaves N" */
  reason: string | null
  /** The checkout table's route from here, if any */
  book: string[] | null
}

/** How much checkout chance throwing at number `n` loses against the best aim, given its best aim.
 *  `evaluate` is the visit's evaluator (model.ts), shared by its darts. */
export function numberCost(evaluate: Evaluator, left: number, darts: number, n: number) {
  const evaluation = evaluate(left, darts)
  const v = evaluation.values
  const best = v.indexOf(Math.max(...v))
  const candidate = candidates(n).reduce((a, b) => (v[b] > v[a] ? b : a))
  return { cost: v[best] - v[candidate], best, candidate, evaluation }
}

const what = (name: string) => (name === 'Miss' ? 'A miss off the board' : name)

/** Why the candidate aim is worse: its outcome that loses the most against the better aim. Null
 *  when that outcome leaves a score with nothing wrong with it on its own. */
function reason(ev: Evaluation, candidate: number, better: number, darts: number): string | null {
  const loss = (o: OutcomeValue) => o.outcome[3] * (ev.values[better] - o.value)
  const worst = ev.outcomes(candidate).reduce((a, b) => (loss(b) > loss(a) ? b : a))
  const name = what(worst.outcome[0])
  if (worst.after === 'bust') return `${name} busts`
  if (worst.after === 'out') return `${name} checks out`
  const after = worst.after
  const next = darts - 1
  if (next === 0) {
    if (after > 170 || fin[after][3] === 0) return `${name} leaves ${after}, which one visit can't finish`
    return fin[after][1] === 0 ? `${name} leaves ${after}, with no one-dart finish` : null
  }
  return fin[after][next] === 0 ? `${name} leaves ${after}, which ${next === 1 ? 'one dart' : 'two darts'} can't finish` : null
}

/** The notes for a seat's darts on a finish (walk.ts throwsOf), in throw order. */
export function strategyNotes(throws: readonly Throw[]): CoachNote[] {
  const notes: CoachNote[] = []
  // One evaluator per visit: its darts share the start and w, so they share its memo
  let visit = ''
  let evaluate: Evaluator = evaluator(0, 0)
  for (const t of throws) {
    if (t.left > 170 || t.checkout) continue
    const n = landedNumber(t.d)
    if (n === null) continue
    if (`${t.leg}-${t.visit}` !== visit) {
      visit = `${t.leg}-${t.visit}`
      evaluate = evaluator(t.start, t.w)
    }
    const { cost, best, candidate, evaluation } = numberCost(evaluate, t.left, t.darts, n)
    if (cost < NOTE_THRESHOLD) continue
    notes.push({
      leg: t.leg,
      visit: t.visit,
      dart: t.dart,
      left: t.left,
      darts: t.darts,
      thrown: t.d.segment.multiplier === 0 ? 'Miss' : t.d.segment.name,
      better: AIMS[best].label,
      cost,
      reason: reason(evaluation, candidate, best, t.darts),
      book: checkoutHint(t.left, 'double', t.darts),
    })
  }
  return notes
}
