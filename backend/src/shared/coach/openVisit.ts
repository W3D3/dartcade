// The coach on a visit still being thrown (the live panel, the admin sandbox): the visit reviewed the
// way the coach reviews a real leg, and the next dart's best aims.
import { AIMS, type Aim } from './aims.js'
import type { CoachModel, CoachModels } from './model.js'
import { reviewLeg, type ReviewVisit } from './review.js'
import { walkVisit, type CoachDart, type CoachLeg, type CoachVisit } from './walk.js'

export type OpenVisitInput = {
  /** The score left when the visit starts, 2–501 */
  start: number
  /** The opponent's score left; null: solo */
  opponent: number | null
  /** Your 3-dart average, for the scoring grades (the model is your target tier's); null: the visit's own */
  average: number | null
}

export type AimChance = { aim: Aim; chance: number }

export type OpenVisit = {
  /** Null before the first dart */
  visit: ReviewVisit | null
  /** The score before the next dart */
  left: number
  /** No more darts: three thrown, a bust or a checkout */
  done: boolean
  /** The next dart's best aims with their checkout chance; empty when done */
  next: AimChance[]
}

/** The visit as the game stores it, a bust scoring nothing. */
function visitOf(start: number, darts: readonly CoachDart[]): CoachVisit {
  const last = walkVisit(start, darts).at(-1)
  const remaining = last?.after ?? start
  return { seat: 0, darts, scored: start - remaining, remaining, bust: last?.bust ?? false }
}

/** The leg the coach reviews: the opponent's (empty) visit on their score first, then yours. */
export function openVisitLeg(input: OpenVisitInput, darts: readonly CoachDart[]): CoachLeg {
  const mine = visitOf(input.start, darts)
  const visits = input.opponent === null ? [mine] : [{ seat: 1, darts: [], scored: 0, remaining: input.opponent, bust: false }, mine]
  return { leg: 0, visits }
}

/** The best of each label's aims (outer and inner single share one), best first */
function bestPerLabel<T extends { aim: Aim }>(xs: readonly T[], by: (x: T) => number, top: number): T[] {
  const best = new Map<string, T>()
  for (const x of xs) {
    const seen = best.get(x.aim.label)
    if (!seen || by(x) > by(seen)) best.set(x.aim.label, x)
  }
  return [...best.values()].sort((a, b) => by(b) - by(a)).slice(0, top)
}

/** The next dart's `top` best aims from `left` with `darts` darts left in a visit that started on
 *  `start`, by their chance (`model`'s) to check out this visit or (weighted by w) the next; none that can't. */
export function bestAims(model: CoachModel, start: number, left: number, darts: number, w: number, top: number): AimChance[] {
  const { values } = model.evaluator(start, w)(left, darts)
  const chances = values.map((chance, i) => ({ aim: AIMS[i], chance })).filter(a => a.chance > 0)
  return bestPerLabel(chances, a => a.chance, top)
}

/** The `top` aims with the most points a dart (`model`'s), for more than 170 left. */
export function scoringAims({ landing }: CoachModel, top: number): { aim: Aim; points: number }[] {
  const points = landing.map((o, i) => ({ aim: AIMS[i], points: o.reduce((s, [, p, , chance]) => s + p * chance, 0) }))
  return bestPerLabel(points, a => a.points, top)
}

/** The open visit after `darts`, and the `top` best aims for the next dart. `models.model`: the
 *  player's target tier's (tiers.ts targetTier). */
export function coachOpenVisit(input: OpenVisitInput, darts: readonly CoachDart[], models: CoachModels, top: number): OpenVisit {
  const { model } = models
  const leg = openVisitLeg(input, darts)
  const visit =
    reviewLeg([leg], 0, 0, { startScore: input.start, average: input.average, models, opponentName: () => 'Opponent' })?.visits[0] ?? null
  const left = visit ? (visit.darts.at(-1)?.left ?? input.start) : input.start
  const done = visit !== null && (visit.bust || visit.then === 0 || darts.length >= 3)
  if (done) return { visit, left, done, next: [] }

  const w = input.opponent === null ? 1 : 1 - model.nextVisit(input.opponent)
  return { visit, left, done, next: bestAims(model, input.start, left, 3 - darts.length, w, top) }
}
