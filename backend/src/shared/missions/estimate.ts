// "Usually takes 6–12 min · about 60 darts": a rough guess for the builder's preview, not a rule.
// Each step's darts are what it asks for (its dart window, its visits, or two darts a hit with no
// window), half again for every level of difficulty (failed attempts); a visit of three darts takes
// 18 to 36 seconds; the time limit caps the longer end.
import { stepLevel } from './difficulty.js'
import type { Mission, Step } from './types.js'

const SECONDS_PER_VISIT = { min: 18, max: 36 } as const

function stepDarts(step: Step): number {
  switch (step.type) {
    case 'checkout':
      return step.maxDarts
    case 'leg':
    case 'score':
      return step.within
    case 'hit':
      return step.within === 'visit' ? 3 : (step.within ?? 2 * step.hits * step.targets.length)
    case 'marks':
      return step.within ?? step.marks * (step.per === 'each' ? step.targets.length : 1)
    case 'visits':
    case 'average':
      return 3 * step.visits
  }
}

export type Estimate = { darts: number; minMinutes: number; maxMinutes: number }

export function estimate(mission: Pick<Mission, 'steps' | 'timeLimit'>): Estimate {
  const raw = mission.steps.reduce((sum, s) => sum + stepDarts(s) * (1 + stepLevel(s) / 2), 0)
  const darts = Math.max(5, Math.round(raw / 5) * 5)
  const minutes = (perVisit: number) => Math.max(1, Math.round(((darts / 3) * perVisit) / 60))
  const cap = mission.timeLimit === undefined ? Infinity : Math.max(1, Math.round(mission.timeLimit / 60))
  const maxMinutes = Math.min(minutes(SECONDS_PER_VISIT.max), cap)
  return { darts, minMinutes: Math.min(minutes(SECONDS_PER_VISIT.min), maxMinutes), maxMinutes }
}
