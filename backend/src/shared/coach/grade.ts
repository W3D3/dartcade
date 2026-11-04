// Every visit's tag (Scoring, Setup, Doubling), grade (Perfect to Bad, eight classes) and one line
// saying why. A strategy note (not a tip) makes any visit Bad; a visit that keeps the fewest-darts
// finish is Perfect. Otherwise a Scoring visit is graded on its rating against the average, a Setup
// or Doubling one (a bust too) on its darts' value change (value.ts) plus the closeness credit of
// the darts that missed their target. The bands were set on real legs (the spec's calibration table).
import { checkoutHint } from '../checkout.js'
import { oneDartFinish } from './aims.js'
import type { DartClass } from './dartClass.js'
import { minDarts } from './minDarts.js'
import { closenessBonus, groupingBonus, groupingWhy, type Grouping } from './grouping.js'
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

export type VisitTag = 'scoring' | 'setup' | 'doubling'
/** Best to worst */
export const VISIT_GRADES = ['perfect', 'excellent', 'great', 'good', 'ok', 'inaccuracy', 'weak', 'bad'] as const
export type VisitGrade = (typeof VISIT_GRADES)[number]
/** A value-graded class: every grade but Perfect, which only the fewest-darts rule gives */
type ValueGrade = Exclude<VisitGrade, 'perfect'>
export type VisitFacts = {
  /** The score before the visit */
  start: number
  /** This visit's walked darts (walk.ts throwsOf: stops at a bust) */
  throws: Throw[]
  scored: number
  then: number
  bust: boolean
  /** Each walked dart's class (dartClass.ts), in throw order */
  classes: readonly Closeness[]
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
}
/** What overrode or capped the value: the fewest-darts finish (Perfect), a strategy note (Bad), a
 *  very low score (Weak at best), darts spilled into 1 or 5 (Inaccuracy at best); null: the value's band */
export type GradeRule = 'perfect' | 'note' | 'veryLow' | 'spill' | null
/** The rating's parts on a Scoring visit: scored + grouping + closeness = rating */
export type ScoringValue = { scored: number; grouping: number; closeness: number; rating: number; average: number }
/** How the grade was worked out (the debug view). `points` on the tag's scale: a Setup or Doubling
 *  visit's Σ (dart Δ + closeness), a Scoring visit's rating − average; `scoring` its parts there. */
export type VisitValue = { points: number; scoring: ScoringValue | null; rule: GradeRule }
/** `tip`: the text is a tip's (a note that leaves the grade alone) */
export type VisitGrading = { tag: VisitTag; grade: VisitGrade; text: string; tip: boolean; value: VisitValue }

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
/** The worse of two grades */
const worse = (a: VisitGrade, b: VisitGrade): VisitGrade => (VISIT_GRADES.indexOf(a) > VISIT_GRADES.indexOf(b) ? a : b)

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

/** A dart's grade: its value change plus its closeness credit */
export const dartGrade = (delta: number, close: number | null) => delta + (close ?? 0)

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

const doubleName = (left: number) => (left === 50 ? 'the bull' : `D${left / 2}`)
const TREBLES = ['', '', 'Two trebles.', 'Three trebles.']

export function tagOf(f: VisitFacts): VisitTag {
  if (f.start > 170) return 'scoring'
  return f.throws.some(t => oneDartFinish(t.left)) ? 'doubling' : 'setup'
}

const noteText = (n: CoachNote) =>
  `${n.tip ? 'Tip: ' : ''}On ${n.left}, ${n.thrown}: better ${n.better}${n.reason === null ? '' : ` — ${n.reason}`}.`
/** Busted on purpose to stay on the start: the busting dart was a Bust-back */
const bustBack = (f: VisitFacts) => f.bust && f.classes.at(-1)?.kind === 'bustBack'
const bustText = (f: VisitFacts) => `Busted on ${f.throws.at(-1)?.left ?? f.start}.`
const bustBackText = (f: VisitFacts) =>
  `Busted on purpose to stay on ${f.start}${oneDartFinish(f.start) ? ` (${doubleName(f.start)})` : ''}.`

type Graded = { grade: VisitGrade; text: string; value: VisitValue }

function scoring(f: VisitFacts): Graded {
  const sv: ScoringValue = {
    scored: f.scored,
    grouping: f.grouping ? groupingBonus(f.grouping.spreadMm) : 0,
    closeness: f.grouping ? closenessBonus(f.grouping.edgeMm) : 0,
    rating: f.grouping?.rating ?? f.scored,
    average: f.average,
  }
  const points = sv.rating - f.average
  const g = (grade: VisitGrade, text: string, rule: GradeRule = null): Graded => ({ grade, text, value: { points, scoring: sv, rule } })
  const low = `Scored ${f.scored}; your usual visit is ${Math.round(f.average)}.`
  const grade = bandOf(points, SCORING_BANDS)
  const capped = (cap: VisitGrade, rule: GradeRule) => (worse(grade, cap) === grade ? null : rule)
  if (f.scored < VERY_LOW) return g(worse(grade, 'weak'), low, capped('weak', 'veryLow'))
  const spilled = f.throws.filter((t, i) => f.classes[i].target?.aimId === 'T20' && [1, 5].includes(landedNumber(t.d) ?? 0)).length
  // Below Inaccuracy the score says more than the spill
  if (spilled >= 2 && points >= SCORING_INACCURACY_FROM)
    return g(worse(grade, 'inaccuracy'), `${spilled} darts drifted into 1 or 5.`, capped('inaccuracy', 'spill'))
  if (points < SCORING_OK_FROM) return g(grade, low)
  // The grouping lifted the grade above the score's: say why
  if (f.grouping && grade !== bandOf(f.scored - f.average, SCORING_BANDS))
    return g(grade, `Scored ${f.scored}, ${groupingWhy(f.grouping) || 'well placed'}.`)
  const trebles = f.throws.filter(t => t.d.segment.multiplier === 3).length
  return g(grade, ((grade === 'great' || grade === 'excellent') && TREBLES[trebles]) || `Scored ${f.scored}.`)
}

/** Some dart went at the double on a one-dart finish (the bull on 50) */
const atDouble = (f: VisitFacts) => f.throws.some((t, i) => oneDartFinish(t.left) && ['double', 'bull'].includes(f.classes[i].kind))

/** Setup and Doubling: graded by how much the darts changed the checkout chance (value.ts), plus
 *  the closeness credit of each missed dart. */
function finishing(f: VisitFacts): Graded {
  const out = f.throws.find(t => t.checkout)
  const total = f.throws.reduce((s, _, i) => s + dartGrade(f.deltas[i], closeness(f.classes[i])), 0)
  const grade = bandOf(total, FINISH_BANDS)
  const g = (grade: VisitGrade, text: string): Graded => ({ grade, text, value: { points: total, scoring: null, rule: null } })
  // A bust ends on the start's next visit (value.ts): graded like any other end, told as a bust
  if (f.bust) return g(grade, bustBack(f) ? bustBackText(f) : bustText(f))
  if (out) return g(grade, `Checked out on ${doubleName(out.left)}.`)
  const route = checkoutHint(f.then, 'double', 3)
  const leave = route ? `${f.then} left is a ${route.length}-dart finish (${route.join(' · ')}).` : `${f.then} left: no 3-dart finish.`
  const worst = f.throws.reduce((a, _, i) => (f.deltas[i] < f.deltas[a] ? i : a), 0)
  const cost = Math.round(-f.deltas[worst])
  if (total >= 0 || cost < 1) return g(grade, leave)
  const t = f.throws[worst]
  const name = t.d.segment.multiplier === 0 ? 'Miss' : t.d.segment.name
  return g(grade, `${name} on ${t.left} cost ${cost}% checkout chance: ${leave}`)
}

/** The visit keeps the fewest darts to check out its start: its darts plus the fewest from what it left */
const perfect = (f: VisitFacts) => !f.bust && minDarts(f.start) === f.throws.length + minDarts(f.then)

function perfectText(f: VisitFacts): string {
  const out = f.throws.find(t => t.checkout)
  if (out) return `Checked out in the fewest darts (${doubleName(out.left)}).`
  const k = minDarts(f.then)
  if (f.first && f.start === 501 && k === 6) return 'Nine-darter still on.'
  return `Scored ${f.scored}: ${f.then} left is still a ${k}-dart finish, the fewest possible.`
}

export function classifyVisit(f: VisitFacts): VisitGrading {
  const tag = tagOf(f)
  const note = explainedNote(f.notes)
  const out = f.throws.some(t => t.checkout)
  const matchDart = f.lastVisitOfLostLeg && !out && atDouble(f)
  const graded = tag === 'scoring' ? scoring(f) : finishing(f)
  const g = (grade: VisitGrade, text: string, rule: GradeRule, tip = false): VisitGrading => ({
    tag,
    grade,
    text: matchDart ? `Missed the match dart. ${text}` : text,
    tip,
    value: { ...graded.value, rule },
  })
  // A note says another aim was better: Bad on any visit
  if (note && !note.tip) return g('bad', noteText(note), 'note')
  // A tip leaves the grade alone, and Perfect keeps its own line
  if (perfect(f)) return g('perfect', perfectText(f), 'perfect')
  // A tip's line, unless the visit ended on a bust or a checkout, which say so
  return note && !f.bust && !out
    ? g(graded.grade, noteText(note), graded.value.rule, true)
    : g(graded.grade, graded.text, graded.value.rule)
}
