// Every visit's tag (Scoring, Setup, Doubling), grade (Brilliant to Bad, eight classes) and one line
// saying why. A strategy note (not a tip) makes any visit Bad; a visit that keeps the fewest-darts
// finish is Brilliant when that was hard for the fixed reference level (model.ts DEFAULT_COACH_LEVEL,
// an 81 average — not the player's own coaching level), else at least Excellent. Otherwise a Scoring visit is graded on its rating against the average, a Setup
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
type ValueGrade = Exclude<VisitGrade, 'brilliant'>
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
  /** The chance (0–1) the fixed reference level (model.ts DEFAULT_COACH_LEVEL, an 81 average)
   *  keeps the fewest-darts path from `start` for this visit's darts (minDarts.ts fewestChance):
   *  how hard a fewest-darts visit was, the same for every player */
  fewestChance: number
}
/** What overrode or capped the value: the fewest-darts finish when it was hard (Brilliant) or not
 *  (`fewest`: lifted to Excellent), a strategy note (Bad), a very low score (Weak at best), darts
 *  spilled into 1 or 5 (Inaccuracy at best); null: the value's band */
export type GradeRule = 'brilliant' | 'fewest' | 'note' | 'veryLow' | 'spill' | null
/** The rating's parts on a Scoring visit: scored + grouping + closeness = rating */
export type ScoringValue = { scored: number; grouping: number; closeness: number; rating: number; average: number }
/** How the grade was worked out (the debug view). `points` on the tag's scale: a Setup or Doubling
 *  visit's Σ (dart Δ + closeness), a Scoring visit's rating − average; `scoring` its parts there;
 *  `fewestChance` (%) the fewest-darts path's chance on a visit that kept it, else null. */
export type VisitValue = { points: number; scoring: ScoringValue | null; rule: GradeRule; fewestChance: number | null }
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

const doubleName = (left: number) => (left === 50 ? 'the bull' : `D${left / 2}`)

const PART: Record<string, string> = { T: 'treble', S: 'single', D: 'double', B: 'bull', '2': 'single bull' }
/** A checkout route by its shape: "one-dart finish" for one dart (D16, Bull), else its darts' beds
 *  in order: "single to double" (S16 · D16), "treble to double" (T20 · D8), "treble to single to
 *  bull" (T20 · S10 · Bull); the 25 is a "single bull". */
export const routeShape = (route: readonly string[]): string =>
  route.length === 1 ? 'one-dart finish' : route.map(d => PART[d[0]]).join(' to ')
/** "100 left is a treble to double (T20 · D20)."; null without a route */
const routeText = (left: number, route: readonly string[] | null) =>
  route ? `${left} left is a ${routeShape(route)} (${route.join(' · ')}).` : null
const TREBLES = ['', '', 'Two trebles.', 'Three trebles.']

export function tagOf(f: VisitFacts): VisitTag {
  if (f.start > 170) return 'scoring'
  return f.throws.some(t => oneDartFinish(t.left)) ? 'doubling' : 'setup'
}

const noteText = (n: CoachNote) =>
  `${n.tip ? 'Tip: ' : ''}On ${n.left}, ${n.thrown}: better ${n.better}${n.reason === null ? '' : ` — ${n.reason}`}.`
/** Busted on purpose to stay on the start: the busting dart was a Bust-back */
const bustBack = (f: VisitFacts) => f.bust && f.classes.at(-1)?.kind === 'bustBack'
const ORDINAL = ['first', 'second', 'third']
const dartName = (t: Throw) => (t.d.segment.multiplier === 0 ? 'Miss' : t.d.segment.name)
/** "Busted on the first dart (S10 on 8)."; after darts thrown before it, what they did (a
 *  Doubling visit's, `after`) and " Back on 40." */
function bustText(f: VisitFacts, after: readonly string[] = []): string {
  const t = f.throws[f.throws.length - 1]
  const before = after.length ? `, after ${after.join(', ')}` : ''
  return `Busted on the ${ORDINAL[t.dart]} dart (${dartName(t)} on ${t.left})${before}.${t.dart === 0 ? '' : ` Back on ${f.start}.`}`
}
const bustBackText = (f: VisitFacts) =>
  `Busted on purpose with the ${ORDINAL[f.throws[f.throws.length - 1].dart]} dart to stay on ${f.start}${oneDartFinish(f.start) ? ` (${doubleName(f.start)})` : ''}.`

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
  const g = (grade: VisitGrade, text: string, rule: GradeRule = null): Graded => ({
    grade,
    text,
    value: { points, scoring: sv, rule, fewestChance: null },
  })
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

const COUNT = ['no', 'one', 'two', 'three']
/** Where a dart at the double missed it; a bull's detail is sb (in the 25) or none */
const WHERE: Record<string, string> = { inside: 'inside', outside: 'outside', wide: 'wide', sb: 'in the 25' }
const whereOf = (c: DartClass) => WHERE[('detail' in c && c.detail) || 'wide']
const targetName = (c: DartClass) => (c.target?.aimId === 'Bull' ? 'the bull' : (c.target?.label ?? 'the double'))
/** A dart at the double on a one-dart finish (the bull on 50) */
const atTheDouble = (t: Throw, c: DartClass) => oneDartFinish(t.left) && (c.kind === 'double' || (c.kind === 'bull' && t.left === 50))

/** Missed darts at one double: "3 darts at D4, all just outside (5 mm on average)", "2 darts at
 *  D16 missed (one inside, one wide)"; as `misses`, the bust's after: "one miss outside D4",
 *  "two misses at D4 (one inside, one wide)". The mm (edgeMm) from the placed darts only. */
function doubleMisses(cs: readonly DartClass[], misses: boolean): string {
  const n = cs.length
  const target = targetName(cs[0])
  const placed = cs.flatMap(c => (c.miss && !c.estimated ? [c.miss.edgeMm] : []))
  const mmAvg = placed.length ? Math.round(placed.reduce((a, b) => a + b, 0) / placed.length) : null
  const mm = mmAvg === null ? '' : `${mmAvg} mm${n > 1 ? ' on average' : ''}`
  const wheres = cs.map(whereOf)
  const same = wheres.every(w => w === wheres[0])
  if (same) {
    const where = `${mmAvg !== null && mmAvg <= NEAR_MISS_MM ? 'just ' : ''}${wheres[0]}`
    const paren = mm ? ` (${mm})` : ''
    const place = wheres[0] === 'in the 25' ? where : `${where}${wheres[0] === 'wide' ? ' of' : ''} ${target}`
    if (misses) return `${COUNT[n]} ${n === 1 ? 'miss' : 'misses'} ${place}${paren}`
    return `${n} ${n === 1 ? 'dart' : 'darts'} at ${target}, ${n === 1 ? '' : 'all '}${where}${paren}`
  }
  const counts = [...new Set(wheres)].map(w => `${COUNT[wheres.filter(x => x === w).length]} ${w}`).join(', ')
  const paren = ` (${counts}${mm ? `, ${mm}` : ''})`
  return misses ? `${COUNT[n]} misses at ${target}${paren}` : `${n} darts at ${target} missed${paren}`
}

/** A dart on a finish that wasn't at the double: "the third split to D8", "the second missed the
 *  split to D2 (S1)", "the first was S7", "the third missed" */
function otherDart(t: Throw, c: DartClass): string {
  const ord = `the ${ORDINAL[t.dart]}`
  if (c.kind === 'split' && c.plannedLeave !== null)
    return c.hit
      ? `${ord} split to ${doubleName(c.plannedLeave)}`
      : `${ord} missed the split to ${doubleName(c.plannedLeave)} (${dartName(t)})`
  return t.after === t.left ? `${ord} missed` : `${ord} was ${dartName(t)}`
}

/** What the darts from the first one on a one-dart finish up to `end` did: a run of darts at one
 *  double as one phrase, any other dart on its own. */
function doublingStory(f: VisitFacts, end: number, misses: boolean): string[] {
  const phrases: string[] = []
  let i = f.throws.findIndex(t => oneDartFinish(t.left))
  while (i >= 0 && i < end) {
    const c = f.classes[i]
    if (!atTheDouble(f.throws[i], c)) {
      phrases.push(otherDart(f.throws[i], c))
      i++
      continue
    }
    let j = i + 1
    while (j < end && atTheDouble(f.throws[j], f.classes[j]) && f.classes[j].target?.aimId === c.target?.aimId) j++
    phrases.push(doubleMisses(f.classes.slice(i, j), misses))
    i = j
  }
  return phrases
}

/** A Doubling visit that didn't check out: what happened to the double, then where you stand.
 *  "3 darts at D4, all just outside (5 mm on average). Still on 8."; a new score with its route */
function doublingText(f: VisitFacts): string {
  const story = doublingStory(f, f.throws.length, false).join(', ')
  const stand = f.then === f.start ? `Still on ${f.start}.` : (routeText(f.then, checkoutHint(f.then, 'double', 3)) ?? `${f.then} left.`)
  return `${story[0].toUpperCase()}${story.slice(1)}. ${stand}`
}

/** Setup and Doubling: graded by how much the darts changed the checkout chance (value.ts), plus
 *  the closeness credit of each missed dart. */
function finishing(f: VisitFacts): Graded {
  const out = f.throws.find(t => t.checkout)
  const total = f.throws.reduce((s, t, i) => s + dartGrade(f.deltas[i], closeness(f.classes[i]), t.bust ? bustPenalty(t.dart) : 0), 0)
  const grade = bandOf(total, FINISH_BANDS)
  const g = (grade: VisitGrade, text: string): Graded => ({
    grade,
    text,
    value: { points: total, scoring: null, rule: null, fewestChance: null },
  })
  // A bust ends on the start's next visit (value.ts): graded like any other end, told as a bust
  const doubling = tagOf(f) === 'doubling'
  if (f.bust) return g(grade, bustBack(f) ? bustBackText(f) : bustText(f, doubling ? doublingStory(f, f.throws.length - 1, true) : []))
  if (out) return g(grade, `Checked out on ${doubleName(out.left)}.`)
  if (doubling) return g(grade, doublingText(f))
  const route = checkoutHint(f.then, 'double', 3)
  const leave = routeText(f.then, route) ?? `${f.then} left: no checkout in three darts.`
  const worst = f.throws.reduce((a, _, i) => (f.deltas[i] < f.deltas[a] ? i : a), 0)
  const cost = Math.round(-f.deltas[worst])
  if (total >= 0 || cost < 1) return g(grade, leave)
  const t = f.throws[worst]
  return g(grade, `${dartName(t)} on ${t.left} cost ${cost}% checkout chance: ${leave}`)
}

/** The visit keeps the fewest darts to check out its start: its darts plus the fewest from what it left */
const fewest = (f: VisitFacts) => !f.bust && minDarts(f.start) === f.throws.length + minDarts(f.then)

function fewestText(f: VisitFacts): string {
  const out = f.throws.find(t => t.checkout)
  if (out) return `Checked out in the fewest darts (${doubleName(out.left)}).`
  const k = minDarts(f.then)
  if (f.first && f.start === 501 && k === 6) return 'Nine-darter still on.'
  const route = checkoutHint(f.then, 'double', 3)
  const leave = route?.length === k ? `is still a ${routeShape(route)} (${route.join(' · ')})` : `is still ${k} darts from a checkout`
  return `Scored ${f.scored}: ${f.then} left ${leave}, the fewest possible.`
}

export function classifyVisit(f: VisitFacts): VisitGrading {
  const tag = tagOf(f)
  const note = explainedNote(f.notes)
  const out = f.throws.some(t => t.checkout)
  const matchDart = f.lastVisitOfLostLeg && !out && atDouble(f)
  const graded = tag === 'scoring' ? scoring(f) : finishing(f)
  const g = (grade: VisitGrade, text: string, rule: GradeRule, tip = false, fewestChance: number | null = null): VisitGrading => ({
    tag,
    grade,
    text: matchDart ? `Missed the match dart. ${text}` : text,
    tip,
    value: { ...graded.value, rule, fewestChance },
  })
  // A note says another aim was better: Bad on any visit
  if (note && !note.tip) return g('bad', noteText(note), 'note')
  // A tip leaves the grade alone, and the fewest darts keep their own line
  if (fewest(f)) {
    const chance = f.fewestChance * 100
    if (f.fewestChance < BRILLIANT_CHANCE) return g('brilliant', fewestText(f), 'brilliant', false, chance)
    // Excellent is the best a value gives, so the floor is the grade; the rule only when it lifted it
    return g('excellent', fewestText(f), graded.grade === 'excellent' ? graded.value.rule : 'fewest', false, chance)
  }
  // A tip's line, unless the visit ended on a bust or a checkout, which say so
  return note && !f.bust && !out
    ? g(graded.grade, noteText(note), graded.value.rule, true)
    : g(graded.grade, graded.text, graded.value.rule)
}
