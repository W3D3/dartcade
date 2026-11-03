// Every visit's tag (Scoring, Setup, Doubling), grade (Great to Mistake) and one line saying why.
// The worst matching rule wins: Mistake > Weak > Great > Good > OK. A strategy note (not a tip) is
// a Mistake on any visit; a bust is one too, unless its busting dart was a Bust-back.
import { checkoutHint } from '../checkout.js'
import { landedNumber, scoringAim } from './aim.js'
import { oneDartFinish } from './aims.js'
import type { DartClass, DartKind } from './dartClass.js'
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
/** Strategy note: the better aim gives at least this much more checkout chance (5 points) */
export const NOTE_THRESHOLD = 0.05
/** Leg pattern: a long finish takes more than this many darts from 170 or less to the checkout */
export const LONG_FINISH = 9
/** Leg pattern: scoring visits 4 and later average this much less than visits 1–3… */
export const LATE_DROP = 20
/** …in a leg with at least this many scoring visits */
export const LATE_DROP_VISITS = 6

export type VisitTag = 'scoring' | 'setup' | 'doubling'
export type VisitGrade = 'great' | 'good' | 'ok' | 'weak' | 'mistake'
export type VisitFacts = {
  /** The score before the visit */
  start: number
  /** This visit's walked darts (walk.ts throwsOf: stops at a bust) */
  throws: Throw[]
  scored: number
  then: number
  bust: boolean
  /** Each walked dart's class (dartClass.ts), in throw order */
  classes: readonly Pick<DartClass, 'kind' | 'plannedLeave'>[]
  /** How its placed darts sat together (grouping.ts); null with fewer than 2 */
  grouping: Pick<Grouping, 'spreadMm' | 'edgeMm' | 'rating'> | null
  /** This visit's notes, tips included */
  notes: CoachNote[]
  /** The player's 3-dart average (30-day, or the game's) */
  average: number
  /** The seat's last visit in a leg the opponent won */
  lastVisitOfLostLeg: boolean
}
/** `tip`: the text is a tip's (a note that leaves the grade alone); unset otherwise */
export type VisitGrading = { tag: VisitTag; grade: VisitGrade; text: string; tip?: true }

/** The note a visit's text (and the leg review's rail) explains: the costliest that isn't a tip,
 *  else the costliest tip; null without notes. */
export function explainedNote(notes: readonly CoachNote[]): CoachNote | null {
  const costliest = (ns: readonly CoachNote[]) => ns.reduce<CoachNote | null>((a, n) => (a === null || n.cost > a.cost ? n : a), null)
  return costliest(notes.filter(n => !n.tip)) ?? costliest(notes)
}

const doubleName = (left: number) => (left === 50 ? 'the bull' : `D${left / 2}`)
const list = new Intl.ListFormat('en', { type: 'conjunction' })
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

function scoring(f: VisitFacts): VisitGrading {
  const g = (grade: VisitGrade, text: string): VisitGrading => ({ tag: 'scoring', grade, text })
  // From 171–180 a later dart can be thrown on a finish, and draw a note
  const note = explainedNote(f.notes)
  const mistake = note?.tip ? null : note
  if (mistake) return g('mistake', noteText(mistake))
  const low = `Scored ${f.scored}; your usual visit is ${Math.round(f.average)}.`
  if (f.scored < VERY_LOW) return g('mistake', low)
  const grade = byAverage(f.grouping?.rating ?? f.scored, f.average)
  if (grade === 'weak') return g('weak', low)
  const spilled = f.throws.filter(t => scoringAim(t.d, t.visitDarts) === 20 && [1, 5].includes(landedNumber(t.d) ?? 0)).length
  if (spilled >= 2) return g('weak', `${spilled} darts drifted into 1 or 5.`)
  // The grouping lifted the grade above the score's: say why
  if (f.grouping && grade !== byAverage(f.scored, f.average))
    return g(grade, `Scored ${f.scored}, ${groupingWhy(f.grouping) || 'well placed'}.`)
  const trebles = f.throws.filter(t => t.d.segment.multiplier === 3).length
  return g(grade, (grade === 'great' && TREBLES[trebles]) || `Scored ${f.scored}.`)
}

function setup(f: VisitFacts): VisitGrading {
  const g = (grade: VisitGrade, text: string): VisitGrading => ({ tag: 'setup', grade, text })
  const note = explainedNote(f.notes)
  const mistake = note?.tip ? null : note
  if (mistake) return g('mistake', noteText(mistake))
  if (f.bust) return bustBack(f) ? g('ok', bustBackText(f)) : g('mistake', bustText(f))
  const grade = oneDartFinish(f.then) ? 'good' : 'ok'
  if (note) return { ...g(grade, noteText(note)), tip: true }
  const route = checkoutHint(f.then, 'double', 3)
  return g(grade, route ? `${f.then} left is a ${route.length}-dart finish (${route.join(' · ')}).` : `${f.then} left: no 3-dart finish.`)
}

/** Ended on 4 or 2 from a one-dart finish of 6 or more, every scoring dart in the single half of
 *  the double it was thrown at. */
const chasedDown = (f: VisitFacts, out: boolean) =>
  !f.bust &&
  !out &&
  oneDartFinish(f.start) &&
  f.start >= 6 &&
  (f.then === 4 || f.then === 2) &&
  f.throws.every(t => t.d.segment.multiplier === 0 || (t.d.segment.multiplier === 1 && t.d.segment.number * 2 === t.left))

/** A dart on a one-dart finish with one of these classes went for something else than the double */
const NOT_AT_DOUBLE: ReadonlySet<DartKind> = new Set(['split', 'route', 'bustBack'])

/** How many single-half misses in a row a double survives: 16 → 8 → 4 → 2 is 3, 12 → 6 is 1, the bull 0 */
export function doubleDepth(left: number): number {
  let n = 0
  while (left !== 50 && left % 4 === 0) {
    left /= 2
    n++
  }
  return n
}

/** A split only spares the double when it moves to one that survives more misses (38 → S6 for D16, not 16 → S4 for D6) */
const wentForTheDouble = (t: Throw, c: VisitFacts['classes'][number]) =>
  c.kind === 'split' ? c.plannedLeave === null || doubleDepth(c.plannedLeave) <= doubleDepth(t.left) : !NOT_AT_DOUBLE.has(c.kind)

function doubling(f: VisitFacts): VisitGrading {
  const back = bustBack(f)
  const atDouble = f.throws.filter((t, i) => oneDartFinish(t.left) && wentForTheDouble(t, f.classes[i]))
  const out = f.throws.find(t => t.checkout)
  const matchDart = f.lastVisitOfLostLeg && !out && atDouble.length > 0
  const note = explainedNote(f.notes)
  // A tip (no other note) speaks for the visit, the grade left alone; a checkout keeps its own line
  const tip = note?.tip && !out ? note : null
  const g = (grade: VisitGrade, text: string): VisitGrading => {
    const said = tip ? noteText(tip) : text
    return { tag: 'doubling', grade, text: matchDart ? `Missed the match dart. ${said}` : said, ...(tip && { tip: true as const }) }
  }
  const k = atDouble.length
  const missed = `${k} dart${k === 1 ? '' : 's'} at ${list.format([...new Set(atDouble.map(t => doubleName(t.left)))])} missed.`
  if (note && !note.tip) return g('mistake', noteText(note))
  if (f.bust && !back) return g('mistake', bustText(f))
  if (matchDart && !oneDartFinish(f.then)) return g('mistake', missed)
  if (chasedDown(f, out !== undefined)) return g('weak', `Chased down to ${f.then}.`)
  if ((k >= 2 && !out) || matchDart) return g('weak', missed)
  if (out) return g('great', `Checked out on ${doubleName(out.left)}.`)
  // Its own line, over a tip
  if (back) return { tag: 'doubling', grade: 'ok', text: bustBackText(f) }
  return g('ok', missed)
}

export function classifyVisit(f: VisitFacts): VisitGrading {
  const tag = tagOf(f)
  return tag === 'scoring' ? scoring(f) : tag === 'setup' ? setup(f) : doubling(f)
}
