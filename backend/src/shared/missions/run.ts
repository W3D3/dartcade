// A mission being played, as a pure reducer: which step is up, each step's attempt, the visit and the
// clock. Time comes in from outside (`tick`, the server's time of each input), so a replay of the
// same inputs at the same times gives the same run.
import { dartOn, initAttempt, type Outcome, perVisit, progressOf, type StepAttempt, visitEndOn } from './steps.js'
import type { Mission, MissionDart } from './types.js'

export type StepRun = {
  attempt: StepAttempt
  /** Attempts at the step so far, the one being played included. */
  attempts: number
  /** The most progress any attempt made (a streak's best). */
  best: number
  /** Darts thrown at the step, every attempt. */
  darts: number
  /** Mission time (ms) when the step was done; null until then. */
  doneAt: number | null
}

/** A dart of the open visit: where it landed and the progress it made (a bust's can be negative). */
export type Chip = { number: number; multiplier: number; gain: number; outcome: Outcome }

export type Clock = {
  /** The latest input's time (ms since the epoch); null before the first. */
  now: number | null
  /** The first input's time: the clock starts with the first dart (or any input). */
  startedAt: number | null
  pausedAt: number | null
  /** Time spent paused before `pausedAt`. */
  pausedMs: number
}

export type MissionRun = {
  steps: StepRun[]
  /** The step the darts go to. */
  active: number
  status: 'playing' | 'completed' | 'failed'
  failure: 'time' | 'gave_up' | null
  /** Start overs (the Start over policy). */
  restarts: number
  /** Darts thrown while the mission ran. */
  darts: number
  /** The open visit. `locked`: the rest of it doesn't count (the next step counts whole visits). */
  visit: { chips: Chip[]; locked: boolean }
  clock: Clock
  /** Mission time when it was completed or failed. */
  timeMs: number | null
}

const freshStep = (mission: Mission, i: number): StepRun => ({
  attempt: initAttempt(mission.steps[i]),
  attempts: 1,
  best: 0,
  darts: 0,
  doneAt: null,
})

export function startRun(mission: Mission): MissionRun {
  return {
    steps: mission.steps.map((_, i) => freshStep(mission, i)),
    active: 0,
    status: 'playing',
    failure: null,
    restarts: 0,
    darts: 0,
    visit: { chips: [], locked: false },
    clock: { now: null, startedAt: null, pausedAt: null, pausedMs: 0 },
    timeMs: null,
  }
}

/** Mission time at the latest input: the clock stops while paused. */
export function elapsed(clock: Clock): number {
  if (clock.startedAt === null || clock.now === null) return 0
  return (clock.pausedAt ?? clock.now) - clock.startedAt - clock.pausedMs
}

/** When the time runs out (ms since the epoch) while the clock runs; null without a limit, paused or over. */
export function deadline(mission: Mission, run: MissionRun): number | null {
  const { startedAt, pausedAt, pausedMs } = run.clock
  if (mission.timeLimit === undefined || run.status !== 'playing' || pausedAt !== null || startedAt === null) return null
  return startedAt + pausedMs + mission.timeLimit * 1000
}

const isOver = (run: MissionRun) => run.status !== 'playing'
export const isPaused = (run: MissionRun) => run.clock.pausedAt !== null

/** The time of an input: starts the clock, and fails the mission once its time is up. */
export function tick(mission: Mission, run: MissionRun, now: number): MissionRun {
  if (isOver(run)) return run
  const clock = { ...run.clock, now, startedAt: run.clock.startedAt ?? now }
  const limit = mission.timeLimit === undefined ? null : mission.timeLimit * 1000
  if (limit !== null && elapsed(clock) > limit) return { ...run, clock, status: 'failed', failure: 'time', timeMs: limit }
  return { ...run, clock }
}

// The first step not done, from `from` on (in order: only `from` itself)
function nextStep(mission: Mission, steps: StepRun[], from: number): number | null {
  if (mission.order === 'in_order') return from < steps.length ? from : null
  const i = steps.findIndex((s, j) => j >= from && s.doneAt === null)
  const wrapped = i >= 0 ? i : steps.findIndex(s => s.doneAt === null)
  return wrapped >= 0 ? wrapped : null
}

// The step is done: the next one is up, or the mission is complete
function complete(mission: Mission, run: MissionRun): MissionRun {
  const at = elapsed(run.clock)
  const steps = run.steps.map((s, i) => (i === run.active ? { ...s, doneAt: at } : s))
  const next = nextStep(mission, steps, run.active + 1)
  if (next === null) return { ...run, steps, status: 'completed', timeMs: at }
  return { ...run, steps, active: next, visit: { ...run.visit, locked: perVisit(mission.steps[next]) } }
}

// The attempt failed: the step starts again (Retry), or every step does from the first (Start over)
function fail(mission: Mission, run: MissionRun): MissionRun {
  const failed = run.steps[run.active]
  if (mission.onFail === 'restart') {
    const steps = run.steps.map((s, i) => ({
      ...freshStep(mission, i),
      attempts: i === run.active ? s.attempts + 1 : s.attempts,
      best: s.best,
      darts: s.darts,
    }))
    return { ...run, steps, active: 0, restarts: run.restarts + 1, visit: { ...run.visit, locked: perVisit(mission.steps[0]) } }
  }
  const steps = run.steps.map((s, i) =>
    i === run.active ? { ...s, attempt: initAttempt(mission.steps[i]), attempts: failed.attempts + 1 } : s,
  )
  return { ...run, steps, visit: { ...run.visit, locked: perVisit(mission.steps[run.active]) } }
}

function settle(mission: Mission, run: MissionRun, outcome: Outcome): MissionRun {
  switch (outcome) {
    case 'done':
      return complete(mission, run)
    case 'fail':
      return fail(mission, run)
    case 'visit_over':
      return { ...run, visit: { ...run.visit, locked: true } }
    case 'go':
      return run
  }
}

// The active step's attempt is now `attempt`: its best and the darts it took
function withAttempt(mission: Mission, run: MissionRun, attempt: StepAttempt, dart: boolean): MissionRun {
  const step = mission.steps[run.active]
  const steps = run.steps.map((s, i) =>
    i === run.active ? { ...s, attempt, best: Math.max(s.best, progressOf(step, attempt).value), darts: s.darts + (dart ? 1 : 0) } : s,
  )
  return { ...run, steps }
}

/** A dart: the active step counts it, unless the mission is over, paused or the visit is locked. */
export function throwDart(mission: Mission, run: MissionRun, dart: MissionDart): MissionRun {
  if (isOver(run) || isPaused(run)) return run
  const counted = { ...run, darts: run.darts + 1 }
  const chip = { number: dart.number, multiplier: dart.multiplier }
  if (run.visit.locked) return { ...counted, visit: { ...run.visit, chips: [...run.visit.chips, { ...chip, gain: 0, outcome: 'go' }] } }
  const step = mission.steps[run.active]
  const before = progressOf(step, run.steps[run.active].attempt).value
  const { run: attempt, outcome } = dartOn(step, run.steps[run.active].attempt, dart)
  const gain = progressOf(step, attempt).value - before
  const played = withAttempt(
    mission,
    { ...counted, visit: { ...run.visit, chips: [...run.visit.chips, { ...chip, gain, outcome }] } },
    attempt,
    true,
  )
  return settle(mission, played, outcome)
}

/** The visit ended (takeout): the active step hears it, and the next visit starts clean. */
export function endVisit(mission: Mission, run: MissionRun): MissionRun {
  if (isOver(run)) return run
  const fresh = { chips: [], locked: false }
  if (run.visit.locked || isPaused(run) || run.visit.chips.length === 0) return { ...run, visit: fresh }
  const step = mission.steps[run.active]
  const { run: attempt, outcome } = visitEndOn(step, run.steps[run.active].attempt)
  return { ...settle(mission, withAttempt(mission, run, attempt, false), outcome), visit: fresh }
}

/** Between visits: steps can be switched (any order), and the clock paused or resumed. */
export const betweenVisits = (run: MissionRun) => !isOver(run) && run.visit.chips.length === 0

/** Plays step `to` next (any order only); the step left starts its attempt over when it comes back. */
export function switchStep(mission: Mission, run: MissionRun, to: number): MissionRun {
  if (mission.order !== 'any' || !betweenVisits(run) || isPaused(run)) return run
  if (to === run.active || !run.steps[to] || run.steps[to].doneAt !== null) return run
  const steps = run.steps.map((s, i) => (i === run.active ? { ...s, attempt: initAttempt(mission.steps[i]) } : s))
  return { ...run, steps, active: to }
}

export function pause(mission: Mission, run: MissionRun): MissionRun {
  if (!mission.pause || !betweenVisits(run) || isPaused(run) || run.clock.now === null) return run
  return { ...run, clock: { ...run.clock, pausedAt: run.clock.now } }
}

export function resume(run: MissionRun): MissionRun {
  const { pausedAt, now } = run.clock
  if (isOver(run) || pausedAt === null || now === null) return run
  return { ...run, clock: { ...run.clock, pausedAt: null, pausedMs: run.clock.pausedMs + (now - pausedAt) } }
}

export function giveUp(run: MissionRun): MissionRun {
  if (isOver(run)) return run
  return { ...run, status: 'failed', failure: 'gave_up', timeMs: elapsed(run.clock) }
}

/** Steps done. */
export const stepsDone = (run: MissionRun): number => run.steps.filter(s => s.doneAt !== null).length
