// Every visit's tag (Scoring, Setup, Doubling), grade (Perfect to Mistake) and one line saying why.
// A strategy note (not a tip) is a Mistake on any visit; a visit that keeps the fewest-darts finish
// is Perfect. Otherwise a Scoring visit is graded on its score against the average, a Setup or
// Doubling one (a bust too) on its darts' value change (value.ts) plus the closeness credit of the
// darts that missed their target.
import { checkoutHint } from '../checkout.js'
import { landedNumber } from './aim.js'
import { oneDartFinish } from './aims.js'
import type { DartClass } from './dartClass.js'
import { minDarts } from './minDarts.js'
import { groupingWhy, type Grouping } from './grouping.js'
import type { CoachNote } from './notes.js'
import type { Throw } from './walk.js'

/** Scoring: under this is a Mistake. On the raw score: a tight group doesn't rescue a 26 */
export const VERY_LOW = 26
/** Scoring, by the visit's rating (grouping.ts): this far below the average (or more) is Weak */
export const LOW_BELOW = 25
/** Scoring: this far above the average (or more) is Good */
export const GOOD_ABOVE = 15
/** Scoring: this far above the average (or more) is Great */
export const GREAT_ABOVE = 40
/** Setup and Doubling, the visit's grade in checkout-chance points (value.ts, plus closeness): Great from this */
export const GREAT_FROM = 15
/** …Good from this */
export const GOOD_FROM = 5
/** …OK from this */
export const OK_FROM = -10
/** …Weak from this, Mistake below */
export const WEAK_FROM = -20
/** A dart that missed its target earns up to this many points… */
export const MISS_CLOSE_MAX = 5
/** …falling to none this far (mm) from the target's bed */
export const MISS_CLOSE_ZERO_MM = 20

export type VisitTag = 'scoring' | 'setup' | 'doubling'
export type VisitGrade = 'perfect' | 'great' | 'good' | 'ok' | 'weak' | 'mistake'
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
/** `tip`: the text is a tip's (a note that leaves the grade alone) */
export type VisitGrading = { tag: VisitTag; grade: VisitGrade; text: string; tip: boolean }

/** The note a visit's text (and the leg review's rail) explains: the costliest that isn't a tip,
 *  else the costliest tip; null without notes. */
export function explainedNote(notes: readonly CoachNote[]): CoachNote | null {
  const costliest = (ns: readonly CoachNote[]) => ns.reduce<CoachNote | null>((a, n) => (a === null || n.cost > a.cost ? n : a), null)
  return costliest(notes.filter(n => !n.tip)) ?? costliest(notes)
}

type Closeness = Pick<DartClass, 'kind' | 'hit' | 'target' | 'estimated' | 'edgeMm'>

/** The credit for a dart that missed its target, the closer the more; null for a hit, a typed
 *  dart or one without a target. A hit's outcome is already in its value. */
export function closeness(c: Closeness): number | null {
  if (c.hit || c.estimated || c.target === null || c.edgeMm === null) return null
  return MISS_CLOSE_MAX * Math.max(0, 1 - c.edgeMm / MISS_CLOSE_ZERO_MM)
}

/** A dart's grade: its value change plus its closeness credit */
export const dartGrade = (delta: number, close: number | null) => delta + (close ?? 0)

const byValue = (x: number): VisitGrade =>
  x >= GREAT_FROM ? 'great' : x >= GOOD_FROM ? 'good' : x >= OK_FROM ? 'ok' : x >= WEAK_FROM ? 'weak' : 'mistake'

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

/** Weak, OK, Good or Great by a visit's score or rating against the player's average */
const byAverage = (x: number, average: number): VisitGrade =>
  x <= average - LOW_BELOW ? 'weak' : x >= average + GREAT_ABOVE ? 'great' : x >= average + GOOD_ABOVE ? 'good' : 'ok'

type Graded = { grade: VisitGrade; text: string }

function scoring(f: VisitFacts): Graded {
  const g = (grade: VisitGrade, text: string): Graded => ({ grade, text })
  const low = `Scored ${f.scored}; your usual visit is ${Math.round(f.average)}.`
  if (f.scored < VERY_LOW) return g('mistake', low)
  const grade = byAverage(f.grouping?.rating ?? f.scored, f.average)
  if (grade === 'weak') return g('weak', low)
  const spilled = f.throws.filter((t, i) => f.classes[i].target?.aimId === 'T20' && [1, 5].includes(landedNumber(t.d) ?? 0)).length
  if (spilled >= 2) return g('weak', `${spilled} darts drifted into 1 or 5.`)
  // The grouping lifted the grade above the score's: say why
  if (f.grouping && grade !== byAverage(f.scored, f.average))
    return g(grade, `Scored ${f.scored}, ${groupingWhy(f.grouping) || 'well placed'}.`)
  const trebles = f.throws.filter(t => t.d.segment.multiplier === 3).length
  return g(grade, (grade === 'great' && TREBLES[trebles]) || `Scored ${f.scored}.`)
}

/** Some dart went at the double on a one-dart finish (the bull on 50) */
const atDouble = (f: VisitFacts) => f.throws.some((t, i) => oneDartFinish(t.left) && ['double', 'bull'].includes(f.classes[i].kind))

/** Setup and Doubling: graded by how much the darts changed the checkout chance (value.ts), plus
 *  the closeness credit of each missed dart. */
function finishing(f: VisitFacts): Graded {
  const out = f.throws.find(t => t.checkout)
  const g = (grade: VisitGrade, text: string): Graded => ({ grade, text })
  const total = f.throws.reduce((s, _, i) => s + dartGrade(f.deltas[i], closeness(f.classes[i])), 0)
  const grade = byValue(total)
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
  const g = ({ grade, text }: Graded, tip = false): VisitGrading => ({
    tag,
    grade,
    text: matchDart ? `Missed the match dart. ${text}` : text,
    tip,
  })
  // A note says another aim was better: a Mistake on any visit
  if (note && !note.tip) return g({ grade: 'mistake', text: noteText(note) })
  // A tip leaves the grade alone, and Perfect keeps its own line
  if (perfect(f)) return g({ grade: 'perfect', text: perfectText(f) })
  const graded = tag === 'scoring' ? scoring(f) : finishing(f)
  // A tip's line, unless the visit ended on a bust or a checkout, which say so
  return note && !f.bust && !out ? g({ grade: graded.grade, text: noteText(note) }, true) : g(graded)
}
