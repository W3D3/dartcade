// What each step type counts: a pure rule per type over one attempt's darts and visit ends. The
// mission (run.ts) owns attempts, failures and the clock; a rule only says how an attempt stands.
import type { MissionDart, Step, StepOf, StepType, Target } from './types.js'

/**
 * What a dart or a visit end did to the attempt: `go` on, `done` (the step is complete), `fail` (the
 * attempt is over), or `visit_over` (a fast leg's bust: the rest of the visit doesn't count).
 */
export type Outcome = 'go' | 'done' | 'fail' | 'visit_over'

/** How far the attempt is: `value` of `of`, plus the score left (checkout, leg) or the average so far. */
export type Progress = { value: number; of: number; left?: number; average?: number | null }

type Rule<P extends Step, R> = {
  /** Attempts are counted in whole visits: one starts only at a visit's first dart. */
  perVisit(step: P): boolean
  init(step: P): R
  dart(step: P, run: R, dart: MissionDart): { run: R; outcome: Outcome }
  visitEnd(step: P, run: R): { run: R; outcome: Outcome }
  progress(step: P, run: R): Progress
}

const go = <R>(run: R) => ({ run, outcome: 'go' as const })

/** Whether `dart` hits `target` (see TargetSchema). */
export function hits(target: Target, dart: MissionDart): boolean {
  if (dart.multiplier === 0) return false
  if (target === 'B') return dart.number === 25 || dart.number === 50
  if (target === 'DB') return dart.number === 50
  const ring = target[0]
  const n = Number(/\d+/.exec(target)?.[0])
  if (dart.number !== n) return false
  if (ring === 'S') return dart.multiplier === 1
  if (ring === 'D') return dart.multiplier === 2
  if (ring === 'T') return dart.multiplier === 3
  return true
}

/** Marks a dart makes on its number: a double 2, a treble 3; the outer bull 1 and the inner bull 2 on 25. */
export function marksOf(dart: MissionDart): { target: number; marks: number } | null {
  if (dart.multiplier === 0 || dart.number === 0) return null
  if (dart.number === 50) return { target: 25, marks: 2 }
  return { target: dart.number, marks: dart.number === 25 ? 1 : dart.multiplier }
}

type HitRun = { counts: number[]; next: number; darts: number }

const hit: Rule<StepOf<'hit'>, HitRun> = {
  perVisit: step => step.within === 'visit',
  init: step => ({ counts: step.targets.map(() => 0), next: 0, darts: 0 }),
  dart(step, run, dart) {
    const i =
      step.order === 'in_order'
        ? run.next < step.targets.length && hits(step.targets[run.next], dart)
          ? run.next
          : -1
        : step.targets.findIndex((t, j) => run.counts[j] < step.hits && hits(t, dart))
    const counts = run.counts.map((c, j) => (j === i ? c + 1 : c))
    const next = step.order === 'in_order' && i >= 0 && counts[i] === step.hits ? run.next + 1 : run.next
    const after = { counts, next, darts: run.darts + 1 }
    if (counts.every(c => c >= step.hits)) return { run: after, outcome: 'done' }
    if (step.inARow && i < 0) return { run: after, outcome: 'fail' }
    if (typeof step.within === 'number' && after.darts >= step.within) return { run: after, outcome: 'fail' }
    return go(after)
  },
  visitEnd: (step, run) => ({ run, outcome: step.within === 'visit' ? 'fail' : 'go' }),
  progress: (step, run) => ({
    value: run.counts.reduce((a, c) => a + Math.min(c, step.hits), 0),
    of: step.hits * step.targets.length,
  }),
}

type MarksRun = { marks: number[]; darts: number }

const marksDone = (step: StepOf<'marks'>, marks: number[]): boolean =>
  step.per === 'each' ? marks.every(m => m >= step.marks) : marks.reduce((a, m) => a + m, 0) >= step.marks

const marks: Rule<StepOf<'marks'>, MarksRun> = {
  perVisit: () => false,
  init: step => ({ marks: step.targets.map(() => 0), darts: 0 }),
  dart(step, run, dart) {
    const made = marksOf(dart)
    const i = made ? step.targets.indexOf(made.target) : -1
    const after = { marks: run.marks.map((m, j) => (j === i && made ? m + made.marks : m)), darts: run.darts + 1 }
    if (marksDone(step, after.marks)) return { run: after, outcome: 'done' }
    if (step.within !== undefined && after.darts >= step.within) return { run: after, outcome: 'fail' }
    return go(after)
  },
  visitEnd: (_step, run) => go(run),
  progress: (step, run) =>
    step.per === 'each'
      ? { value: run.marks.reduce((a, m) => a + Math.min(m, step.marks), 0), of: step.marks * step.targets.length }
      : {
          value: Math.min(
            step.marks,
            run.marks.reduce((a, m) => a + m, 0),
          ),
          of: step.marks,
        },
}

type VisitsRun = { count: number; visitScore: number }

/** Whether a visit's score meets the step. */
export function visitMeets(step: StepOf<'visits'>, score: number): boolean {
  switch (step.compare) {
    case 'at_least':
      return score >= step.points
    case 'at_most':
      return score <= step.points
    case 'exactly':
      return score === step.points
    case 'not':
      return score !== step.points
  }
}

const visits: Rule<StepOf<'visits'>, VisitsRun> = {
  perVisit: () => true,
  init: () => ({ count: 0, visitScore: 0 }),
  dart: (_step, run, dart) => go({ ...run, visitScore: run.visitScore + dart.score }),
  visitEnd(step, run) {
    const met = visitMeets(step, run.visitScore)
    const after = { count: met ? run.count + 1 : run.count, visitScore: 0 }
    if (after.count >= step.visits) return { run: after, outcome: 'done' }
    return { run: after, outcome: !met && step.inARow ? 'fail' : 'go' }
  },
  progress: (step, run) => ({ value: run.count, of: step.visits }),
}

type ScoreRun = { total: number; darts: number }

const score: Rule<StepOf<'score'>, ScoreRun> = {
  perVisit: () => false,
  init: () => ({ total: 0, darts: 0 }),
  dart(step, run, dart) {
    const after = { total: run.total + dart.score, darts: run.darts + 1 }
    if (after.total >= step.points) return { run: after, outcome: 'done' }
    return { run: after, outcome: after.darts >= step.within ? 'fail' : 'go' }
  },
  visitEnd: (_step, run) => go(run),
  progress: (step, run) => ({ value: Math.min(run.total, step.points), of: step.points }),
}

type AverageRun = { visits: number; points: number; darts: number }

const average: Rule<StepOf<'average'>, AverageRun> = {
  perVisit: () => true,
  init: () => ({ visits: 0, points: 0, darts: 0 }),
  dart: (_step, run, dart) => go({ ...run, points: run.points + dart.score, darts: run.darts + 1 }),
  visitEnd(step, run) {
    const after = { ...run, visits: run.visits + 1 }
    if (after.visits < step.visits) return go(after)
    return { run: after, outcome: (after.points / Math.max(1, after.darts)) * 3 >= step.average ? 'done' : 'fail' }
  },
  progress: (step, run) => ({ value: run.visits, of: step.visits, average: run.darts > 0 ? (run.points / run.darts) * 3 : null }),
}

type LegRun = { left: number; visitStart: number; darts: number }
type Finish = 'double' | 'single' | 'master'

/** Whether the dart may finish under `finish`: the inner bull counts as a double. */
export function finishes(dart: MissionDart, finish: Finish): boolean {
  if (finish === 'single') return true
  const double = dart.multiplier === 2 || dart.number === 50
  return finish === 'double' ? double : double || dart.multiplier === 3
}

/**
 * Counting a score down to 0. A checkout fails on a bust; a fast leg plays on from the score the
 * visit started with, like an X01 leg. Either fails once its darts are used up.
 */
function legRule<P extends StepOf<'checkout'> | StepOf<'leg'>>(of: (step: P) => { maxDarts: number; bustFails: boolean }): Rule<P, LegRun> {
  return {
    perVisit: () => true,
    init: step => ({ left: step.start, visitStart: step.start, darts: 0 }),
    dart(step, run, dart) {
      const { maxDarts, bustFails } = of(step)
      const darts = run.darts + 1
      const next = run.left - dart.score
      const bust = next < 0 || (next === 0 && !finishes(dart, step.finish)) || (next === 1 && step.finish !== 'single')
      if (bust) {
        const after = { ...run, left: run.visitStart, darts }
        return { run: after, outcome: bustFails || darts >= maxDarts ? 'fail' : 'visit_over' }
      }
      const after = { ...run, left: next, darts }
      if (next === 0) return { run: after, outcome: 'done' }
      return { run: after, outcome: darts >= maxDarts ? 'fail' : 'go' }
    },
    visitEnd: (_step, run) => go({ ...run, visitStart: run.left }),
    progress: (step, run) => ({ value: step.start - run.left, of: step.start, left: run.left }),
  }
}

/** Every step type's rule. */
const RULES = {
  checkout: legRule<StepOf<'checkout'>>(s => ({ maxDarts: s.maxDarts, bustFails: true })),
  hit,
  marks,
  visits,
  score,
  average,
  leg: legRule<StepOf<'leg'>>(s => ({ maxDarts: s.within, bustFails: false })),
} satisfies Record<StepType, unknown>

/** An attempt's state; only its step's rule reads it. */
export type StepAttempt = unknown

// The one place a step meets its rule. Each rule keeps its own attempt type; outside this file an
// attempt is opaque and only ever handed back to the rule that made it.
// oxlint-disable-next-line typescript/consistent-type-assertions -- RULES is keyed by the step's own type
const ruleOf = <P extends Step>(step: P) => RULES[step.type] as unknown as Rule<P, StepAttempt>

export const perVisit = (step: Step): boolean => ruleOf(step).perVisit(step)
export const initAttempt = (step: Step): StepAttempt => ruleOf(step).init(step)
export const dartOn = (step: Step, run: StepAttempt, dart: MissionDart) => ruleOf(step).dart(step, run, dart)
export const visitEndOn = (step: Step, run: StepAttempt) => ruleOf(step).visitEnd(step, run)
export const progressOf = (step: Step, run: StepAttempt): Progress => ruleOf(step).progress(step, run)
