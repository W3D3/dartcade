// The coach's review of one seat's leg, as the leg review page renders it: every visit graded,
// three A–D skills and the coach's take.
import { bedAim } from './aims.js'
import { classifyDart, NOT_COUNTED, type DartClass } from './dartClass.js'
import { classifyVisit, closeness, type VisitGrade, type VisitTag } from './grade.js'
import { grouping, type Grouping } from './grouping.js'
import type { CoachModel } from './model.js'
import { strategyNotes, throwEvaluations, type CoachNote } from './notes.js'
import { executionStats } from './stats.js'
import { dartDeltas } from './value.js'
import { visitStart } from './visitStart.js'
import { dartPoints, throwsOf, type CoachLeg } from './walk.js'

/** `left`: the score after the dart; after a bust, the visit's start again. `bust`: this dart
 *  busted. The darts the game keeps after a bust aren't walked: `left` is the start, `bust` false,
 *  `class` notCounted. `delta`: the dart's change in checkout chance, in percentage points (value.ts),
 *  `closeness`: the credit for missing its target by little (grade.ts); both null on a Scoring visit
 *  and for the darts after a bust, `closeness` also for a hit or a typed dart. */
export type ReviewDart = {
  name: string
  /** The AIMS id of the bed it landed in (a single's outer bed); null off the board */
  bedAimId: string | null
  coords: { x: number; y: number } | null
  left: number
  bust: boolean
  class: DartClass
  delta: number | null
  closeness: number | null
}
export type ReviewVisit = {
  /** 1-based among the seat's visits in the leg */
  n: number
  left: number
  darts: ReviewDart[]
  scored: number
  then: number
  bust: boolean
  tag: VisitTag
  grade: VisitGrade
  text: string
  /** The text is a tip's: shown in the blue Info style */
  tip: boolean
  notes: CoachNote[]
  /** How its placed darts sat together, and its rating; null with fewer than 2 (grouping.ts) */
  grouping: Grouping | null
}
export type SkillGrade = { grade: 'A' | 'B' | 'C' | 'D' | null; line: string }
export type LegCounts = { lowVisits: number; badSetups: number; missedDoubles: number; clean: boolean }
export type LegReview = {
  /** The bot level whose model judged the leg (model.ts coachLevel) */
  coachLevel: number
  leg: number
  seat: number
  won: boolean
  darts: number
  average: number | null
  visits: ReviewVisit[]
  skills: { scoring: SkillGrade; setup: SkillGrade; doubling: SkillGrade }
  take: string
  counts: LegCounts
  /** The scoring visits' mean grouping spread and edge distance (grouping.ts); null without any */
  grouping: { spreadMm: number | null; edgeMm: number | null }
}
/** `model`: the player's coaching level's (model.ts coachLevel, from the same average) */
/** Leg pattern: a long finish takes more than this many darts from 170 or less to the checkout */
export const LONG_FINISH = 9
/** Leg pattern: scoring visits 4 and later average this much less than visits 1–3… */
export const LATE_DROP = 20
/** …in a leg with at least this many scoring visits */
export const LATE_DROP_VISITS = 6

export type ReviewContext = { startScore: number; average: number | null; model: CoachModel; opponentName: (seat: number) => string }

const NONE: SkillGrade = { grade: null, line: '–' }
const RANK = { A: 0, B: 1, C: 2, D: 3 }
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** The letter for a value against A, B and C's lower bounds */
const letter = (v: number, a: number, b: number, c: number): SkillGrade['grade'] => (v >= a ? 'A' : v >= b ? 'B' : v >= c ? 'C' : 'D')

/** By the leg's average against yours: A at +10 or more, B within ±10, C below −10 down to −25, D below */
export const scoringLetter = (d: number): SkillGrade['grade'] => (d >= 10 ? 'A' : d >= -10 ? 'B' : d >= -25 ? 'C' : 'D')

/** The seat's 3-dart average over the whole game; busts score 0. */
function gameAverage(legs: readonly CoachLeg[], seat: number): number {
  const visits = legs.flatMap(l => l.visits.filter(v => v.seat === seat))
  const darts = visits.reduce((s, v) => s + v.darts.length, 0)
  return darts ? (visits.reduce((s, v) => s + v.scored, 0) / darts) * 3 : 0
}

export function reviewLeg(legs: readonly CoachLeg[], leg: number, seat: number, ctx: ReviewContext): LegReview | null {
  const l = legs.find(x => x.leg === leg)
  const mine = l?.visits.flatMap((v, i) => (v.seat === seat ? [{ v, i }] : [])) ?? []
  const darts = mine.reduce((s, { v }) => s + v.darts.length, 0)
  if (!l || darts === 0) return null

  const average = ctx.average ?? gameAverage(legs, seat)
  const { model } = ctx
  const throws = throwsOf([l], seat, ctx.startScore, model)
  const evaluate = throwEvaluations(model)
  const notes = strategyNotes(throws, model, evaluate)
  const checkout = l.visits.find(v => v.remaining === 0 && !v.bust)
  const won = checkout?.seat === seat
  const lost = l.winner != null && l.winner !== seat

  // Every dart with the score before it, for the long finish
  const before: number[] = []
  const visits = mine.map(({ v, i }, k): ReviewVisit => {
    const start = visitStart(v)
    const vThrows = throws.filter(t => t.visit === i)
    const deltas = start > 170 ? [] : dartDeltas(vThrows, evaluate, model)
    const reviewDarts = v.darts.map((d, j): ReviewDart => {
      // Undefined for a dart after the bust
      const t = vThrows.at(j)
      before.push(t?.left ?? start)
      const bust = t?.bust ?? false
      const cls = t ? classifyDart(t, { evaluation: evaluate(t) }) : NOT_COUNTED
      const delta = deltas.at(j) ?? null
      return {
        name: d.segment.name,
        bedAimId: bedAim(d.segment.name)?.id ?? null,
        coords: d.coords,
        left: t && !bust ? t.left - dartPoints(d) : start,
        bust,
        class: cls,
        delta,
        closeness: delta === null ? null : closeness(cls),
      }
    })
    const vNotes = notes.filter(n => n.visit === i)
    // The walked darts' only: those after a bust aren't
    const walked = reviewDarts.slice(0, vThrows.length)
    const g = grouping(walked, v.scored, average)
    const grading = classifyVisit({
      start,
      throws: vThrows,
      scored: v.scored,
      then: v.remaining,
      bust: v.bust,
      classes: walked.map(d => d.class),
      deltas,
      grouping: g,
      notes: vNotes,
      average,
      first: k === 0,
      lastVisitOfLostLeg: lost && k === mine.length - 1,
    })
    return {
      n: k + 1,
      left: start,
      darts: reviewDarts,
      scored: v.scored,
      then: v.remaining,
      bust: v.bust,
      ...grading,
      notes: vNotes,
      grouping: g,
    }
  })

  const low = (v: ReviewVisit) => v.grade === 'weak' || v.grade === 'mistake'
  const scoringVisits = visits.filter(v => v.tag === 'scoring')
  const setups = visits.filter(v => v.tag === 'setup')
  const stats = executionStats(throws)
  const counts: LegCounts = {
    lowVisits: scoringVisits.filter(low).length,
    // The setup visits graded Bad, as the Setup skill's line counts them
    badSetups: setups.filter(v => v.grade === 'mistake').length,
    missedDoubles: stats.dartsAtDouble - stats.checkouts,
    clean: !visits.some(low),
  }

  const meanOf = (xs: (number | null | undefined)[]) => {
    const ns = xs.filter(x => x != null)
    return ns.length ? mean(ns) : null
  }
  const legGrouping = {
    spreadMm: meanOf(scoringVisits.map(v => v.grouping?.spreadMm)),
    edgeMm: meanOf(scoringVisits.map(v => v.grouping?.edgeMm)),
  }

  const legAverage = stats.scoringAverage
  const lowWords = counts.lowVisits === 0 ? 'no low visits' : counts.lowVisits === 1 ? 'one low visit' : `${counts.lowVisits} low visits`
  const skills = {
    scoring:
      legAverage === null
        ? NONE
        : { grade: scoringLetter(legAverage - average), line: `Leg average ${legAverage.toFixed(1)} · ${lowWords}` },
    setup: setups.length
      ? {
          grade: letter(1 - counts.badSetups / setups.length, 1, 0.75, 0.5),
          line: `${counts.badSetups} of ${plural(setups.length, 'setup visit')} graded Bad`,
        }
      : NONE,
    doubling: stats.dartsAtDouble
      ? {
          grade: letter(stats.checkouts / stats.dartsAtDouble, 0.4, 0.25, 0.1),
          line: `${stats.checkouts} of ${plural(stats.dartsAtDouble, 'dart')} at a double`,
        }
      : NONE,
  }

  const take: string[] = []
  const myLast = mine[mine.length - 1].v.remaining
  if (won) take.push(`Won in ${darts} darts.`)
  else if (checkout && myLast <= 170 && model.fin[myLast][2] > 0) take.push(`You were on a finish after ${darts} darts and still lost.`)
  else if (checkout) take.push(`Lost: ${ctx.opponentName(checkout.seat)} checked out first.`)
  else take.push('Nobody checked out.')

  const graded = (['scoring', 'setup', 'doubling'] as const).flatMap(k => {
    const g = skills[k].grade
    return g === null ? [] : [{ k, rank: RANK[g] }]
  })
  const weakest = graded.reduce<(typeof graded)[number] | null>((w, s) => (w === null || s.rank > w.rank ? s : w), null)
  const faults = [
    [visits.filter(v => v.grade === 'mistake').length, 'bad visit'],
    [visits.filter(v => v.grade === 'weak').length, 'weak visit'],
  ] as const
  const faultWords = faults
    .filter(([n]) => n > 0)
    .map(([n, word], i) => (n === 1 ? `${i === 0 ? 'One' : 'one'} ${word}` : plural(n, word)))
    .join(' and ')
  if (weakest === null || weakest.rank <= RANK.B) take.push(counts.clean ? 'A clean leg.' : `${faultWords}.`)
  else if (weakest.k === 'scoring') take.push('The scoring held you back.')
  else if (weakest.k === 'setup') take.push(`${plural(counts.badSetups, 'bad setup visit')}.`)
  else take.push(`${plural(counts.missedDoubles, 'missed double')}.`)

  const onFinish = before.findIndex(b => b <= 170)
  if (won && onFinish >= 0 && darts - onFinish > LONG_FINISH)
    take.push(`From your first finish to the checkout took ${darts - onFinish} darts.`)
  const scored = scoringVisits.map(v => v.scored)
  if (scored.length >= LATE_DROP_VISITS && mean(scored.slice(3)) <= mean(scored.slice(0, 3)) - LATE_DROP)
    take.push('Your scoring dropped after visit 3.')

  return {
    coachLevel: model.level,
    leg,
    seat,
    won,
    darts,
    average: (mine.reduce((s, { v }) => s + v.scored, 0) / darts) * 3,
    visits,
    skills,
    take: take.join(' '),
    counts,
    grouping: legGrouping,
  }
}
