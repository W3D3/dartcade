// The coach's checkout model for one coaching tier (tiers.ts, landing/<tier>.gen.ts), double out,
// bull 25/50: how likely each aim is to lead to a checkout this visit, or in the next one weighted by
// the chance of getting it (w: the opponents don't check out first). The coach judges a player with
// the model of their target tier (tiers.ts targetTier).
import type { Outcome } from './aims.js'
import { BRILLIANT_TIER, type CoachTierId } from './tiers.js'
import { afterDart } from './walk.js'

/** Per aim, in AIMS order (so the evaluator's values are too): where a dart at it lands */
export type Landing = readonly (readonly Outcome[])[]

export type OutcomeValue = { outcome: Outcome; after: number | 'bust' | 'out'; value: number }

export type Evaluation = {
  /** Each aim's value, in AIMS order */
  values: number[]
  /** How each way a dart at `aim` can land turns out, and what it is worth */
  outcomes(aim: number): OutcomeValue[]
}

export type Evaluator = (left: number, darts: number) => Evaluation

export type CoachModel = {
  /** The tier whose throws the landing table is from */
  tier: CoachTierId
  landing: Landing
  /** fin[r][k]: the chance to check out r (0–170) with at most k darts (0–3) this visit; a bust is a no. */
  fin: readonly (readonly number[])[]
  /** The chance to check out a score with a fresh visit: 0 outside 2–170. */
  nextVisit: (score: number) => number
  /** Values within one visit that started on `start`, with w the chance of a next visit. Spots of
   *  the same visit share the evaluator, so they share its memo. */
  evaluator: (start: number, w: number) => Evaluator
}

/** The best a dart can do from (left, darts) over every aim, memoised: a checkout is worth 1, a
 *  bust `bust`, a visit that ends on `after` without either `end(after)`. */
function valuesOf(landing: Landing, bust: number, end: (after: number) => number) {
  const memo = new Map<number, number>()
  const outcome = (o: Outcome, left: number, darts: number): OutcomeValue => {
    const after = afterDart(left, o[1], o[2])
    if (after === 'out') return { outcome: o, after, value: 1 }
    // The visit ends and the next starts where this one did
    if (after === 'bust') return { outcome: o, after, value: bust }
    return { outcome: o, after, value: darts === 1 ? end(after) : best(after, darts - 1) }
  }
  const value = (aim: number, left: number, darts: number): number =>
    landing[aim].reduce((sum, o) => sum + o[3] * outcome(o, left, darts).value, 0)
  const best = (left: number, darts: number): number => {
    const key = left * 4 + darts
    let v = memo.get(key)
    if (v === undefined) {
      v = 0
      for (let a = 0; a < landing.length; a++) v = Math.max(v, value(a, left, darts))
      memo.set(key, v)
    }
    return v
  }
  return { outcome, value, best }
}

/** The model for `tier` from its landing table. */
export function coachModel(tier: CoachTierId, landing: Landing): CoachModel {
  // This visit only: a bust and a visit that doesn't check out are both a no
  const thisVisit = valuesOf(landing, 0, () => 0)
  const fin = Array.from({ length: 171 }, (_, r) => [0, 1, 2, 3].map(k => (k > 0 && r >= 2 ? thisVisit.best(r, k) : 0)))
  const nextVisit = (score: number): number => (score >= 2 && score <= 170 ? fin[score][3] : 0)

  function evaluator(start: number, w: number): Evaluator {
    const { outcome, value } = valuesOf(landing, w * nextVisit(start), after => w * nextVisit(after))
    return (left, darts) => ({
      values: landing.map((_, a) => value(a, left, darts)),
      outcomes: aim => landing[aim].map(o => outcome(o, left, darts)),
    })
  }

  return { tier, landing, fin, nextVisit, evaluator }
}

// One chunk per tier: the browser fetches only the table it coaches with
const TABLES: Record<CoachTierId, () => Promise<{ LANDING: Landing }>> = {
  beginner: () => import('./landing/beginner.gen.js'),
  pub: () => import('./landing/pub.gen.js'),
  intermediate: () => import('./landing/intermediate.gen.js'),
  semipro: () => import('./landing/semipro.gen.js'),
  pro: () => import('./landing/pro.gen.js'),
  worldclass: () => import('./landing/worldclass.gen.js'),
}
const models = new Map<CoachTierId, Promise<CoachModel>>()

/** The models a review needs: `model` the player's target tier's; `reference` the Brilliant tier's
 *  landing (tiers.ts BRILLIANT_TIER), for how hard the fewest-darts path was, the same for every
 *  player (minDarts.ts fewestPath). */
export type CoachModels = { model: CoachModel; reference: Landing }

/** The target tier's model and the reference landing, loaded together. */
export async function loadCoachModels(tier: CoachTierId): Promise<CoachModels> {
  const [model, reference] = await Promise.all([loadModel(tier), loadModel(BRILLIANT_TIER)])
  return { model, reference: reference.landing }
}

/** The model for a tier, loaded and built once per tier. */
export function loadModel(tier: CoachTierId): Promise<CoachModel> {
  // A stored or sent tier is a string at runtime: an unknown one has no table
  if (!Object.hasOwn(TABLES, tier)) return Promise.reject(new Error(`unknown coach tier: ${tier}`))
  const load = TABLES[tier]
  let m = models.get(tier)
  if (!m) {
    m = load().then(t => coachModel(tier, t.LANDING))
    // A failed fetch (a deploy replaced the chunk) can be tried again
    m.catch(() => models.delete(tier))
    models.set(tier, m)
  }
  return m
}
