// Every visit's tag (Scoring, Setup, Doubling) and grade (Brilliant to Bad, eight classes); the line
// saying why is visitText.ts. A strategy note (not a tip) makes any visit Bad; a visit that keeps the fewest-darts
// finish is Brilliant when that was hard for the fixed reference level (model.ts DEFAULT_COACH_LEVEL,
// an 81 average — not the player's own coaching level), else at least Excellent. Otherwise a Scoring visit is graded on its rating against the average, a Setup
// or Doubling one (a bust too) on its darts' value change (value.ts) plus the closeness credit of
// the darts that missed their target. The bands were set on real legs (the spec's calibration table).
import { oneDartFinish } from './aims.js'
import type { DartClass } from './dartClass.js'
import { closenessBonus, groupingBonus, type Grouping } from './grouping.js'
import type { CoachNote } from './notes.js'
import { landedNumber, type Throw } from './walk.js'

/** Scoring: a visit under this scores Weak at best. On the raw score: a tight group doesn't rescue a 25 */
export const VERY_LOW = 26
/** Scoring, the visit's rating (grouping.ts) against the average: Excellent from this far above… */
export const SCORING_EXCELLENT_FROM = 50
/** …Great from… */
export const SCORING_GREAT_FROM = 25
/** …Good from… */
export const SCORING_GOOD_FROM = 10
/** …OK from (below the average)… */
export const SCORING_OK_FROM = -5
/** …Inaccuracy from… */
export const SCORING_INACCURACY_FROM = -15
/** …Weak from, Bad below */
export const SCORING_WEAK_FROM = -30
/** Setup and Doubling, the visit's checkout-chance points (value.ts, plus closeness): Excellent from this… */
export const EXCELLENT_FROM = 60
/** …Great from… */
export const GREAT_FROM = 20
/** …Good from… */
export const GOOD_FROM = 2
/** …OK from… */
export const OK_FROM = -2
/** …Inaccuracy from… */
export const INACCURACY_FROM = -15
/** …Weak from, Bad below */
export const WEAK_FROM = -20
/** A dart that missed its target earns up to this many points… */
export const MISS_CLOSE_MAX = 5
/** …falling to none this far (mm) from the target's bed */
export const MISS_CLOSE_ZERO_MM = 20
/** A fewest-darts visit is Brilliant when the fixed reference level (model.ts DEFAULT_COACH_LEVEL,
 *  an 81 average) keeps that path from its start less often than this (minDarts.ts fewestChance),
 *  else Excellent at least */
export const BRILLIANT_CHANCE = 0.25
/** A bust costs this many points for each dart of the visit it kept from being thrown */
export const BUST_DART_LOST = 5

export type VisitTag = 'scoring' | 'setup' | 'doubling'
/** Best to worst */
export const VISIT_GRADES = ['brilliant', 'excellent', 'great', 'good', 'ok', 'inaccuracy', 'weak', 'bad'] as const
export type VisitGrade = (typeof VISIT_GRADES)[number]
/** A value-graded class: every grade but Brilliant, which only the fewest-darts rule gives */
export type ValueGrade = Exclude<VisitGrade, 'brilliant'>
export type VisitFacts = {
  /** The score before the visit */
  start: number
  /** This visit's walked darts (walk.ts throwsOf: stops at a bust) */
  throws: Throw[]
  scored: number
  then: number
  bust: boolean
  /** Each walked dart's class (dartClass.ts), in throw order */
  classes: readonly DartClass[]
  /** Each walked dart's value change (value.ts dartDeltas); empty on a Scoring visit */
  deltas: readonly number[]
  /** How its placed darts sat together (grouping.ts); null with fewer than 2 */
  grouping: Pick<Grouping, 'spreadMm' | 'edgeMm' | 'rating' | 'comment'> | null
  /** This visit's notes, tips included */
  notes: CoachNote[]
  /** The player's 3-dart average (30-day, or the game's) */
  average: number
  /** The seat's first visit in the leg */
  first: boolean
  /** The seat's last visit in a leg the opponent won */
  lastVisitOfLostLeg: boolean
  /** On a visit that kept the fewest-darts path: the chance (0–1) the fixed reference level
   *  (model.ts DEFAULT_COACH_LEVEL, an 81 average) keeps it (minDarts.ts fewestPath), how hard it
   *  was, the same for every player; else null */
  fewest: number | null
}
/** What overrode or capped the value: the fewest-darts finish when it was hard (Brilliant) or not
 *  (`fewest`: lifted to Excellent), a strategy note (Bad), a very low score (Weak at best), darts
 *  spilled into 1 or 5 (Inaccuracy at best); null: the value's band */
export type GradeRule = 'brilliant' | 'fewest' | 'note' | 'veryLow' | 'spill' | null
/** The rating's parts on a Scoring visit: scored + grouping + closeness = rating */
export type ScoringValue = { scored: number; grouping: number; closeness: number; rating: number; average: number }
/** A Setup or Doubling dart's part of the visit's points: its value change (value.ts), its
 *  closeness credit (null for a hit or a typed dart) and a bust's penalty (0 without one) */
export type DartTerm = { delta: number; closeness: number | null; penalty: number }
/** One band of a complete scale: Bad's `from` is null (everything below the last bound) */
export type ScaleBand = { grade: ValueGrade; from: number | null }
/** How the grade was worked out (the debug view). `points` on the tag's scale: a Setup or Doubling
 *  visit's Σ `terms` (Δ + closeness − penalty, one per walked dart), a Scoring visit's rating −
 *  average (`scoring` its parts, `terms` empty); `band` the points' band on `bands`, before `rule`;
 *  `fewestChance` (%) the fewest-darts path's chance on a visit that kept it, else null. */
export type VisitValue = {
  points: number
  scoring: ScoringValue | null
  terms: DartTerm[]
  band: ValueGrade
  /** The tag's scale, best first and complete */
  bands: ScaleBand[]
  rule: GradeRule
  fewestChance: number | null
}
/** A visit's tag and grade, and how the grade was worked out */
export type Grading = { tag: VisitTag; grade: VisitGrade; value: VisitValue }

/** A scale's lower bounds, best first: the first class whose bound `points` reaches, else Bad */
export type GradeBands = readonly { grade: ValueGrade; from: number }[]
export const FINISH_BANDS: GradeBands = [
  { grade: 'excellent', from: EXCELLENT_FROM },
  { grade: 'great', from: GREAT_FROM },
  { grade: 'good', from: GOOD_FROM },
  { grade: 'ok', from: OK_FROM },
  { grade: 'inaccuracy', from: INACCURACY_FROM },
  { grade: 'weak', from: WEAK_FROM },
]
export const SCORING_BANDS: GradeBands = [
  { grade: 'excellent', from: SCORING_EXCELLENT_FROM },
  { grade: 'great', from: SCORING_GREAT_FROM },
  { grade: 'good', from: SCORING_GOOD_FROM },
  { grade: 'ok', from: SCORING_OK_FROM },
  { grade: 'inaccuracy', from: SCORING_INACCURACY_FROM },
  { grade: 'weak', from: SCORING_WEAK_FROM },
]
/** The band `points` falls in */
export const bandOf = (points: number, bands: GradeBands): ValueGrade => bands.find(b => points >= b.from)?.grade ?? 'bad'
/** The worse of two grades, and the better */
const worse = (a: VisitGrade, b: VisitGrade): VisitGrade => (VISIT_GRADES.indexOf(a) > VISIT_GRADES.indexOf(b) ? a : b)
const better = (a: VisitGrade, b: VisitGrade): VisitGrade => (worse(a, b) === a ? b : a)

/** The note a visit's text (and the leg review's rail) explains: the costliest that isn't a tip,
 *  else the costliest tip; null without notes. */
export function explainedNote(notes: readonly CoachNote[]): CoachNote | null {
  const costliest = (ns: readonly CoachNote[]) => ns.reduce<CoachNote | null>((a, n) => (a === null || n.cost > a.cost ? n : a), null)
  return costliest(notes.filter(n => !n.tip)) ?? costliest(notes)
}

type Closeness = Pick<DartClass, 'kind' | 'hit' | 'target' | 'estimated' | 'miss'>

/** The credit for a dart that missed its target, the closer the more; null for a hit, a typed
 *  dart or one without a target. A hit's outcome is already in its value. */
export function closeness(c: Closeness): number | null {
  if (c.hit || c.estimated || c.target === null || c.miss === null) return null
  return MISS_CLOSE_MAX * Math.max(0, 1 - c.miss.edgeMm / MISS_CLOSE_ZERO_MM)
}

/** The points a bust with the visit's dart `dart` (0–2) costs for the darts it kept from being thrown */
export const bustPenalty = (dart: number) => BUST_DART_LOST * (2 - dart)

/** A dart's grade: its value change plus its closeness credit, less a bust's penalty */
export const dartGrade = (delta: number, close: number | null, penalty = 0) => delta + (close ?? 0) - penalty

/** A dart's own band by its grade, on the visit scale: good from this (or a hit of its target)… */
export const DART_GOOD_FROM = 5
/** …plain above this, a slight loss (weak) down to and including it… */
export const DART_PLAIN_ABOVE = -5
/** …costly at or below this (and a bust) */
export const DART_COSTLY_AT = -15
/** A missed dart this close to its target's bed (mm, edgeMm) is a near miss: on a double, nearly a checkout */
export const NEAR_MISS_MM = 5

export type DartBand = 'good' | 'plain' | 'weak' | 'costly'

/** The band of a graded dart (a finish or setup visit's): what colours its tile */
export function dartBand(delta: number, close: number | null, hit: boolean, bust: boolean): DartBand {
  const g = dartGrade(delta, close)
  if (bust || g <= DART_COSTLY_AT) return 'costly'
  if (hit || g >= DART_GOOD_FROM) return 'good'
  return g > DART_PLAIN_ABOVE ? 'plain' : 'weak'
}

export function tagOf(f: VisitFacts): VisitTag {
  if (f.start > 170) return 'scoring'
  return f.throws.some(t => oneDartFinish(t.left)) ? 'doubling' : 'setup'
}

/** A Scoring visit's darts aimed at the T20 that drifted into the 1 or 5 */
export const spilled = (f: VisitFacts) =>
  f.throws.filter((t, i) => f.classes[i].target?.aimId === 'T20' && [1, 5].includes(landedNumber(t.d) ?? 0)).length

/** A rule over the value's band: `set` the grade, `cap` it (at best) or `floor` it (at least) */
type Override = { rule: NonNullable<GradeRule>; applies: (f: VisitFacts) => boolean } & (
  | { set: VisitGrade }
  | { cap: VisitGrade }
  | { floor: VisitGrade }
)
const scoringVisit = (f: VisitFacts) => f.start > 170
/** Best first: the first that applies decides; a tip leaves the grade alone. Excellent is the best
 *  a value gives, so the fewest darts' floor is the grade. */
const OVERRIDES: readonly Override[] = [
  { rule: 'note', set: 'bad', applies: f => explainedNote(f.notes)?.tip === false },
  { rule: 'brilliant', set: 'brilliant', applies: f => f.fewest !== null && f.fewest < BRILLIANT_CHANCE },
  { rule: 'fewest', floor: 'excellent', applies: f => f.fewest !== null },
  // On the raw score: a tight group doesn't rescue a 25
  { rule: 'veryLow', cap: 'weak', applies: f => scoringVisit(f) && f.scored < VERY_LOW },
  { rule: 'spill', cap: 'inaccuracy', applies: f => scoringVisit(f) && spilled(f) >= 2 },
]
const overridden = (o: Override, band: VisitGrade): VisitGrade =>
  'set' in o ? o.set : 'cap' in o ? worse(band, o.cap) : better(band, o.floor)

/** Scoring: the rating against the average, and its parts */
function scoringValue(f: VisitFacts): { points: number; scoring: ScoringValue } {
  const scoring: ScoringValue = {
    scored: f.scored,
    grouping: f.grouping ? groupingBonus(f.grouping.spreadMm) : 0,
    closeness: f.grouping ? closenessBonus(f.grouping.edgeMm) : 0,
    rating: f.grouping?.rating ?? f.scored,
    average: f.average,
  }
  return { points: scoring.rating - f.average, scoring }
}

/** Setup and Doubling, each dart: how much it changed the checkout chance (value.ts), plus its
 *  closeness credit, less a bust's penalty. A bust ends on the start's next visit (value.ts): graded
 *  like any other end. */
const finishTerms = (f: VisitFacts): DartTerm[] =>
  f.throws.map((t, i) => ({ delta: f.deltas[i], closeness: closeness(f.classes[i]), penalty: t.bust ? bustPenalty(t.dart) : 0 }))

/** The visit's grade: its value's band, then the first override that applies; the rule is
 *  recorded only when it moved the band. */
export function gradeVisit(f: VisitFacts): Grading {
  const tag = tagOf(f)
  const terms = tag === 'scoring' ? [] : finishTerms(f)
  const { points, scoring } =
    tag === 'scoring'
      ? scoringValue(f)
      : { points: terms.reduce((s, d) => s + dartGrade(d.delta, d.closeness, d.penalty), 0), scoring: null }
  const bands = tag === 'scoring' ? SCORING_BANDS : FINISH_BANDS
  const band = bandOf(points, bands)
  const o = OVERRIDES.find(x => x.applies(f))
  const grade = o ? overridden(o, band) : band
  const fewest = o?.rule === 'brilliant' || o?.rule === 'fewest' ? f.fewest : null
  return {
    tag,
    grade,
    value: {
      points,
      scoring,
      terms,
      band,
      bands: [...bands, { grade: 'bad', from: null }],
      rule: o && grade !== band ? o.rule : null,
      fewestChance: fewest === null ? null : fewest * 100,
    },
  }
}
