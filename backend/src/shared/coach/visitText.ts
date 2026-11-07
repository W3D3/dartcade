// The one line saying why a visit got its grade (grade.ts): a strategy note, the fewest-darts
// path, what the darts did, or a tip.
import { checkoutHint } from '../checkout.js'
import { directOutId, oneDartFinish } from './aims.js'
import type { DartClass } from './dartClass.js'
import {
  bandOf,
  explainedNote,
  finishDarts,
  gradeVisit,
  NEAR_MISS_MM,
  SCORING_BANDS,
  SCORING_INACCURACY_FROM,
  SCORING_OK_FROM,
  spilled,
  VERY_LOW,
  type Grading,
  type VisitFacts,
} from './grade.js'
import { groupingWhy } from './grouping.js'
import { minDarts } from './minDarts.js'
import type { CoachNote } from './notes.js'
import type { Throw } from './walk.js'

/** `tip`: the text is a tip's (a note that leaves the grade alone) */
export type VisitGrading = Grading & { text: string; tip: boolean }

/** An aim as the text names it: D16, "the bull" */
const aimName = (id: string) => (id === 'Bull' ? 'the bull' : id)
/** The double that checks `left` out: D16, "the bull"; only for a one-dart finish */
const outName = (left: number) => aimName(directOutId(left) ?? '')

const PART: Record<string, string> = { T: 'treble', S: 'single', D: 'double', B: 'bull', '2': 'single bull' }
/** A checkout route by its shape: "one-dart finish" for one dart (D16, Bull), else its darts' beds
 *  in order: "single to double" (S16 · D16), "treble to double" (T20 · D8), "treble to single to
 *  bull" (T20 · S10 · Bull); the 25 is a "single bull". */
export const routeShape = (route: readonly string[]): string =>
  route.length === 1 ? 'one-dart finish' : route.map(d => PART[d[0]]).join(' to ')
/** "treble to double (T20 · D20)" */
const routeName = (route: readonly string[]) => `${routeShape(route)} (${route.join(' · ')})`
/** "100 left is a treble to double (T20 · D20)."; null without a route */
const routeText = (left: number, route: readonly string[] | null) => (route ? `${left} left is a ${routeName(route)}.` : null)
const TREBLES = ['', '', 'Two trebles.', 'Three trebles.']

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
  `Busted on purpose with the ${ORDINAL[f.throws[f.throws.length - 1].dart]} dart to stay on ${f.start}${oneDartFinish(f.start) ? ` (${outName(f.start)})` : ''}.`

/** Scoring: what the score, the spill or the grouping says about the grade */
function scoringText(f: VisitFacts, { grade, value: { points } }: Grading): string {
  const low = `Scored ${f.scored}; your usual visit is ${Math.round(f.average)}.`
  if (f.scored < VERY_LOW) return low
  const n = spilled(f)
  // Below Inaccuracy the score says more than the spill
  if (n >= 2 && points >= SCORING_INACCURACY_FROM) return `${n} darts drifted into 1 or 5.`
  if (points < SCORING_OK_FROM) return low
  // The grouping lifted the grade above the score's: say why
  if (f.grouping && grade !== bandOf(f.scored - f.average, SCORING_BANDS))
    return `Scored ${f.scored}, ${groupingWhy(f.grouping) || 'well placed'}.`
  const trebles = f.throws.filter(t => t.d.segment.multiplier === 3).length
  return ((grade === 'great' || grade === 'excellent') && TREBLES[trebles]) || `Scored ${f.scored}.`
}

const COUNT = ['no', 'one', 'two', 'three']
/** Where a dart at the double missed it; a bull's detail is sb (in the 25) or none */
const WHERE: Record<string, string> = { inside: 'inside', outside: 'outside', wide: 'wide', sb: 'in the 25' }
const whereOf = (c: DartClass) => WHERE[('detail' in c && c.detail) || 'wide']
const targetName = (c: DartClass) => (c.target ? aimName(c.target.label) : 'the double')
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
    return c.hit ? `${ord} split to ${outName(c.plannedLeave)}` : `${ord} missed the split to ${outName(c.plannedLeave)} (${dartName(t)})`
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

/** Setup and Doubling: a bust, a checkout, what happened to the double, or the leave and the
 *  costliest dart of a visit that lost value */
function finishingText(f: VisitFacts, { tags, value: { points } }: Grading): string {
  const out = f.throws.find(t => t.checkout)
  const doubling = tags.includes('doubling')
  if (f.bust) return bustBack(f) ? bustBackText(f) : bustText(f, doubling ? doublingStory(f, f.throws.length - 1, true) : [])
  if (out) return `Checked out on ${outName(out.left)}.`
  if (doubling) return doublingText(f)
  const leave = routeText(f.then, checkoutHint(f.then, 'double', 3)) ?? `${f.then} left: no checkout in three darts.`
  const worst = finishDarts(f).reduce((a, d) => (d.delta < a.delta ? d : a))
  const cost = Math.round(-worst.delta)
  if (points >= 0 || cost < 1) return leave
  return `${dartName(worst.t)} on ${worst.t.left} cost ${cost}% checkout chance: ${leave}`
}

function fewestText(f: VisitFacts): string {
  const out = f.throws.find(t => t.checkout)
  if (out) return `Checked out in the fewest darts (${outName(out.left)}).`
  const k = minDarts(f.then)
  if (f.first && f.start === 501 && k === 6) return 'Nine-darter still on.'
  const route = checkoutHint(f.then, 'double', 3)
  const leave = route?.length === k ? `is still a ${routeName(route)}` : `is still ${k} darts from a checkout`
  return `Scored ${f.scored}: ${f.then} left ${leave}, the fewest possible.`
}

/** The visit's line: a strategy note's, the fewest darts', a tip's (unless the visit ended on a
 *  bust or a checkout, which say so), else what the darts did; after a missed match dart, it says so. */
export function visitText(f: VisitFacts, g: Grading): { text: string; tip: boolean } {
  const note = explainedNote(f.notes)
  const out = f.throws.some(t => t.checkout)
  const matchDart = f.lastVisitOfLostLeg && !out && f.throws.some((t, i) => atTheDouble(t, f.classes[i]))
  const line = (text: string, tip = false) => ({ text: matchDart ? `Missed the match dart. ${text}` : text, tip })
  if (note && !note.tip) return line(noteText(note))
  if (f.fewest !== null) return line(fewestText(f))
  if (note && !f.bust && !out) return line(noteText(note), true)
  return line(g.value.scoring ? scoringText(f, g) : finishingText(f, g))
}

/** The visit's grade and its line */
export function classifyVisit(f: VisitFacts): VisitGrading {
  const g = gradeVisit(f)
  return { ...g, ...visitText(f, g) }
}
