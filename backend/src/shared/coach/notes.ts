// Strategy notes: a dart on a finish whose number was clearly worse than the best aim, judged with
// the benefit of the doubt (the best aim on the number it landed in or a neighbour, or the bull or
// 25 for a single near the middle).
import { checkoutHint } from '../checkout.js'
import { AIMS, aimsOn, directOutId, neighbours } from './aims.js'
import type { CoachModel, Evaluation, Evaluator } from './model.js'
import { landedNumber, nearBull, type Throw } from './walk.js'

/** The better aim gives at least this much more checkout chance (5 points) */
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
  /** The better aim's id in AIMS: SO17 or SI17, W20-1, Bull */
  betterAimId: string
  /** Checkout chance lost, 0–1 */
  cost: number
  /** Why, when the worst way the dart can land says it; null for a plain "leaves N" */
  reason: string | null
  /** The checkout table's route from here, if any */
  book: string[] | null
  /** The better aim went for the out and nobody threatens to finish: doesn't change the grade */
  tip: boolean
}

/** How much checkout chance throwing at number `n` loses against the best aim, given its best aim
 *  (or the bull's or 25's with `bull`, walk.ts nearBull): any aim on `n` or either neighbour,
 *  since drifting a wedge sideways is the most common miss there is. `evaluation` is the dart's (throwEvaluations). */
export function numberCost(evaluation: Evaluation, n: number, bull = false) {
  const v = evaluation.values
  const best = v.indexOf(Math.max(...v))
  const candidate = aimsOn([n, ...neighbours(n), ...(bull ? [25] : [])]).reduce((a, b) => (v[b] > v[a] ? b : a))
  return { cost: v[best] - v[candidate], best, candidate }
}

/** A note is a Tip, not a mistake, when the better aim was simply the direct out for `left` (not
 *  some other, better setup) and nobody threatens to finish first. A dart that busted is excluded:
 *  busting is already its own mistake, not a setup choice. */
export function isTip(t: Throw, best: number): boolean {
  if (t.opponentOnOut || t.bust) return false
  return AIMS[best].id === directOutId(t.left)
}

const what = (name: string) => (name === 'Miss' ? 'A miss off the board' : name)

/** What the dart itself did: busted, or left a score that's hard to finish. Null when the score it
 *  left has nothing wrong with it on its own. */
function reason(t: Throw, thrown: string, fin: CoachModel['fin']): string | null {
  const name = what(thrown)
  if (t.bust) return `${name} busts`
  const { after } = t
  const next = t.darts - 1
  if (next === 0) {
    if (after > 170 || fin[after][3] === 0) return `${name} leaves ${after}, which one visit can't finish`
    return fin[after][1] === 0 ? `${name} leaves ${after}, with no one-dart finish` : null
  }
  return fin[after][next] === 0 ? `${name} leaves ${after}, which ${next === 1 ? 'one dart' : 'two darts'} can't finish` : null
}

/** Each dart's evaluation (model.ts), null with more than 170 left: a Scoring dart has no finish
 *  to judge. A visit's darts share one evaluator (its start and w), so they share its memo; each
 *  dart's is computed once, for the notes and the dart classes alike. */
export function throwEvaluations(model: CoachModel): (t: Throw) => Evaluation | null {
  const byVisit = new Map<string, Evaluator>()
  const byThrow = new Map<string, Evaluation>()
  return t => {
    if (t.left > 170) return null
    const visit = `${t.leg}-${t.visit}`
    let e = byThrow.get(`${visit}-${t.dart}`)
    if (!e) {
      let evaluate = byVisit.get(visit)
      if (!evaluate) byVisit.set(visit, (evaluate = model.evaluator(t.start, t.w)))
      byThrow.set(`${visit}-${t.dart}`, (e = evaluate(t.left, t.darts)))
    }
    return e
  }
}

/** The notes for a seat's darts on a finish (walk.ts throwsOf), in throw order, by `model` (the
 *  player's coaching level). Pass the evaluations to share them with the dart classes. */
export function strategyNotes(throws: readonly Throw[], model: CoachModel, evaluate = throwEvaluations(model)): CoachNote[] {
  const notes: CoachNote[] = []
  for (const t of throws) {
    const evaluation = evaluate(t)
    if (!evaluation || t.checkout) continue
    const n = landedNumber(t.d)
    if (n === null) continue
    const { cost, best } = numberCost(evaluation, n, nearBull(t.d))
    if (cost < NOTE_THRESHOLD) continue
    const thrown = t.d.segment.multiplier === 0 ? 'Miss' : t.d.segment.name
    notes.push({
      leg: t.leg,
      visit: t.visit,
      dart: t.dart,
      left: t.left,
      darts: t.darts,
      thrown,
      better: AIMS[best].label,
      betterAimId: AIMS[best].id,
      cost,
      reason: reason(t, thrown, model.fin),
      book: checkoutHint(t.left, 'double', t.darts),
      tip: isTip(t, best),
    })
  }
  return notes
}
