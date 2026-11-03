// The coach's checkout model for one bot level (landing/level-N.gen.ts), double out, bull 25/50:
// how likely each aim is to lead to a checkout this visit, or in the next one weighted by the
// chance of getting it (w: the opponents don't check out first). The coach judges a player with
// the model of their coaching level (coachLevel).
import { LEVEL_AVERAGE } from '../botLevels.js'
import type { Outcome } from './aims.js'
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
  /** The bot level (1–10) whose throws the landing table is from */
  level: number
  landing: Landing
  /** fin[r][k]: the chance to check out r (0–170) with at most k darts (0–3) this visit; a bust is a no. */
  fin: readonly (readonly number[])[]
  /** The chance to check out a score with a fresh visit: 0 outside 2–170. */
  nextVisit: (score: number) => number
  /** Values within one visit that started on `start`, with w the chance of a next visit. Spots of
   *  the same visit share the evaluator, so they share its memo. */
  evaluator: (start: number, w: number) => Evaluator
}

/** Without an average the coach uses level 7 (81 average): the one reference model it had before levels */
export const DEFAULT_COACH_LEVEL = 7

/**
 * The level the coach judges a player against: one level above their average, the smallest
 * LEVEL_AVERAGE strictly above it (a 40 average is coached as level 3, 46). The aims, values and
 * grades are what a slightly better player would expect, so the coach asks for a step up and not
 * a pro's game. Above level 10's average: level 10. No average: DEFAULT_COACH_LEVEL.
 */
export function coachLevel(average: number | null | undefined): number {
  if (average == null || !Number.isFinite(average)) return DEFAULT_COACH_LEVEL
  const i = LEVEL_AVERAGE.findIndex(a => a > average)
  return i === -1 ? LEVEL_AVERAGE.length : i + 1
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

/** The model for `level` from its landing table. */
export function coachModel(level: number, landing: Landing): CoachModel {
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

  return { level, landing, fin, nextVisit, evaluator }
}

// One chunk per level: the browser fetches only the table it coaches with
const TABLES: Partial<Record<number, () => Promise<{ LANDING: Landing }>>> = {
  1: () => import('./landing/level-1.gen.js'),
  2: () => import('./landing/level-2.gen.js'),
  3: () => import('./landing/level-3.gen.js'),
  4: () => import('./landing/level-4.gen.js'),
  5: () => import('./landing/level-5.gen.js'),
  6: () => import('./landing/level-6.gen.js'),
  7: () => import('./landing/level-7.gen.js'),
  8: () => import('./landing/level-8.gen.js'),
  9: () => import('./landing/level-9.gen.js'),
  10: () => import('./landing/level-10.gen.js'),
}
const models = new Map<number, Promise<CoachModel>>()

/** The model for a bot level (1–10), loaded and built once per level. */
export function loadModel(level: number): Promise<CoachModel> {
  const load = TABLES[level]
  if (!load) return Promise.reject(new Error(`coach level out of range: ${level}`))
  let m = models.get(level)
  if (!m) {
    m = load().then(t => coachModel(level, t.LANDING))
    // A failed fetch (a deploy replaced the chunk) can be tried again
    m.catch(() => models.delete(level))
    models.set(level, m)
  }
  return m
}
