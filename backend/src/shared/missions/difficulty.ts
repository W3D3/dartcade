// The difficulty the builder suggests from a mission's steps ("We suggest Hard from your steps"). A
// rough guide, not a rule: each step gets 0 (easy) to 3 (expert), the hardest step sets the mission's,
// and a Start over policy or a limit of five minutes or less makes it one harder.
import { DIFFICULTIES, type Difficulty, type Mission, type Step, type Target } from './types.js'

const clamp = (n: number) => Math.max(0, Math.min(3, n))

// How hard one dart at a target is: a number or single 0, a bull, double or treble 1, the inner bull 2
const targetLevel = (t: Target) => (t === 'DB' ? 2 : t === 'B' || t.startsWith('D') || t.startsWith('T') ? 1 : 0)

// Darts a checkout of `start` needs at best
const fewestDarts = (start: number) => (start <= 50 ? 1 : start <= 110 ? 2 : start <= 170 ? 3 : 3 + Math.ceil((start - 170) / 60))

// A visit of `points` or more every time
const visitLevel = (points: number) => (points >= 140 ? 3 : points >= 100 ? 2 : points >= 60 ? 1 : 0)

const LEG_DARTS = { 301: 6, 501: 9, 701: 12 } as const

/** One step's level, 0 (easy) to 3 (expert). */
export function stepLevel(step: Step): number {
  switch (step.type) {
    case 'checkout': {
      const slack = step.maxDarts - fewestDarts(step.start)
      return slack >= 6 ? 0 : slack >= 3 ? 1 : slack >= 1 ? 2 : 3
    }
    case 'leg': {
      const slack = step.within - LEG_DARTS[step.start]
      return slack >= 12 ? 0 : slack >= 6 ? 1 : slack >= 3 ? 2 : 3
    }
    case 'hit': {
      const total = step.hits * step.targets.length
      const base = Math.round(step.targets.reduce((a, t) => a + targetLevel(t), 0) / step.targets.length)
      const streak = step.inARow ? (total >= 8 ? 2 : total >= 3 ? 1 : 0) : 0
      const ratio = step.within === 'visit' ? 1 : step.within === undefined ? Infinity : step.within / total
      const window = step.within === 'visit' ? 1 : ratio <= 1.5 ? 2 : ratio <= 3 ? 1 : 0
      return clamp(base + streak + window)
    }
    case 'marks': {
      if (step.within === undefined) return 0
      const perDart = (step.marks * (step.per === 'each' ? step.targets.length : 1)) / step.within
      return perDart >= 2 ? 3 : perDart >= 1.5 ? 2 : perDart >= 1 ? 1 : 0
    }
    case 'visits': {
      const level = step.compare === 'at_least' ? visitLevel(step.points) : step.compare === 'exactly' ? 2 : 0
      return clamp(level + (step.inARow && step.visits >= 8 ? 1 : 0))
    }
    case 'score': {
      const perDart = step.points / step.within
      return perDart >= 50 ? 3 : perDart >= 35 ? 2 : perDart >= 20 ? 1 : 0
    }
    case 'average':
      return step.average >= 80 ? 3 : step.average >= 60 ? 2 : step.average >= 40 ? 1 : 0
  }
}

export function suggestDifficulty(mission: Pick<Mission, 'steps' | 'onFail' | 'timeLimit'>): Difficulty {
  const hardest = Math.max(...mission.steps.map(stepLevel))
  const pressure = (mission.onFail === 'restart' ? 1 : 0) + (mission.timeLimit !== undefined && mission.timeLimit <= 300 ? 1 : 0)
  return DIFFICULTIES[clamp(hardest + pressure)]
}
