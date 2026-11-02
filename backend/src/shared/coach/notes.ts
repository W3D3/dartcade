// Strategy notes: a dart on a finish whose number was clearly worse than the best aim, judged with
// the benefit of the doubt (the best aim on the number it landed in or a neighbour, or the bull or
// 25 for a single near the middle).
import { checkoutHint } from '../checkout.js'
import { AIMS } from './aims.js'
import { candidates, landedNumber, nearBull } from './aim.js'
import { evaluator, fin, type Evaluator } from './model.js'
import { NOTE_THRESHOLD } from './grade.js'
import { dartPoints, type Throw } from './walk.js'

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
 *  (or the bull's or 25's with `bull`, aim.ts nearBull). `evaluate` is the visit's evaluator
 *  (model.ts), shared by its darts. */
export function numberCost(evaluate: Evaluator, left: number, darts: number, n: number, bull = false) {
  const evaluation = evaluate(left, darts)
  const v = evaluation.values
  const best = v.indexOf(Math.max(...v))
  const candidate = candidates(n, bull).reduce((a, b) => (v[b] > v[a] ? b : a))
  return { cost: v[best] - v[candidate], best, candidate, evaluation }
}

/** The direct one-dart out for `left`: `D${left/2}` for an even score up to 40, `Bull` for 50.
 *  Null when `left` has no one-dart out (odd, or outside that range). */
function directOutId(left: number): string | null {
  if (left === 50) return 'Bull'
  return left % 2 === 0 && left >= 2 && left <= 40 ? `D${left / 2}` : null
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
function reason(t: Throw, thrown: string): string | null {
  const name = what(thrown)
  if (t.bust) return `${name} busts`
  const after = t.left - dartPoints(t.d)
  const next = t.darts - 1
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
    const { cost, best } = numberCost(evaluate, t.left, t.darts, n, nearBull(t.d))
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
      reason: reason(t, thrown),
      book: checkoutHint(t.left, 'double', t.darts),
      tip: isTip(t, best),
    })
  }
  return notes
}
