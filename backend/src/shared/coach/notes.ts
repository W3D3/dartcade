// Strategy notes: a dart on a finish whose number was clearly worse than the best aim, judged with
// the benefit of the doubt (the best aim on the number it landed in or a neighbour, or the bull or
// 25 for a single near the middle).
import { checkoutHint } from '../checkout.js'
import { AIMS, aimIndex, aimsOn, directOutId, neighbours } from './aims.js'
import { classifyDart } from './dartClass.js'
import type { CoachModel, Evaluation, Evaluator } from './model.js'
import { minDarts } from './minDarts.js'
import { dartPhase, landedNumber, nearBull, type Throw } from './walk.js'

/** The better aim gives at least this much more checkout chance (5 points) */
export const NOTE_THRESHOLD = 0.05
/** A leave dart (walk.ts dartPhase) loses at least this much more chance (25 points) of leaving a
 *  score no visit can finish (minDarts above 3) than the best aim */
export const BOGEY_THRESHOLD = 0.25

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
  /** Checkout chance lost, 0–1; the extra chance of a bogey leave when `byLeave` */
  cost: number
  /** Why, when the worst way the dart can land says it; null for a plain "leaves N" */
  reason: string | null
  /** The checkout table's route from here, if any */
  book: string[] | null
  /** Judged by its leave (the chance of a bogey leave, `cost`), not by checkout chance: a leave dart (walk.ts) */
  byLeave: boolean
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

/** The chance a dart at aim `a` leaves a score no visit can finish (a bogey: minDarts above 3) */
export const bogeyChance = (e: Evaluation, a: number): number =>
  e.outcomes(a).reduce((s, o) => (typeof o.after === 'number' && minDarts(o.after) > 3 ? s + o.outcome[3] : s), 0)

/** The best aim on a leave dart: the highest checkout chance, and of equal ones (all zero from far
 *  out) the one with the least chance of a bogey leave. `among`: only these aims (AIMS indexes). */
export const bestLeaveAim = (e: Evaluation, among: readonly number[] = e.values.map((_, i) => i)): number =>
  among.reduce((b, i) => (e.values[i] > e.values[b] || (e.values[i] === e.values[b] && bogeyChance(e, i) < bogeyChance(e, b)) ? i : b))

/** numberCost for a leave dart: how much more chance of a bogey leave the dart's aim has than the
 *  best aim. The aim is `aimed` (the dart's classified target, when it has a position), else the
 *  safest aim on the number `n` it landed in or either neighbour. */
export function leaveCost(evaluation: Evaluation, n: number, bull = false, aimed: string | null = null) {
  const best = bestLeaveAim(evaluation)
  const candidate =
    aimed === null
      ? aimsOn([n, ...neighbours(n), ...(bull ? [25] : [])]).reduce((a, b) =>
          bogeyChance(evaluation, b) < bogeyChance(evaluation, a) ? b : a,
        )
      : aimIndex(aimed)
  return { cost: bogeyChance(evaluation, candidate) - bogeyChance(evaluation, best), best, candidate }
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

/** Each dart's evaluation (model.ts), null for a scoring dart (more than 170 left, not the leave
 *  dart): it has no finish to judge. A visit's darts share one evaluator (its start and w), so they share its memo; each
 *  dart's is computed once, for the notes and the dart classes alike. */
export function throwEvaluations(model: CoachModel): (t: Throw) => Evaluation | null {
  const byVisit = new Map<string, Evaluator>()
  const byThrow = new Map<string, Evaluation>()
  return t => {
    if (dartPhase(t) === 'scoring') return null
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
 *  player's target tier). Pass the evaluations to share them with the dart classes. */
export function strategyNotes(throws: readonly Throw[], model: CoachModel, evaluate = throwEvaluations(model)): CoachNote[] {
  const notes: CoachNote[] = []
  for (const t of throws) {
    const evaluation = evaluate(t)
    if (!evaluation || t.checkout) continue
    const n = landedNumber(t.d)
    if (n === null) continue
    const byLeave = dartPhase(t) === 'leave'
    const target = byLeave ? classifyDart(t, { evaluation }) : null
    // A placed dart was aimed where the classification says; a typed one gets the benefit of the doubt
    const aimed = target && !target.estimated ? (target.target?.aimId ?? null) : null
    const { cost, best } = byLeave ? leaveCost(evaluation, n, nearBull(t.d), aimed) : numberCost(evaluation, n, nearBull(t.d))
    if (cost < (byLeave ? BOGEY_THRESHOLD : NOTE_THRESHOLD)) continue
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
      byLeave,
      tip: isTip(t, best),
    })
  }
  return notes
}
