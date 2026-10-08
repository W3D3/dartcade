// Around the Clock, dart by dart: which target each dart was thrown at and whether it hit,
// using the module's own rules (a multiplier can skip targets), for the details page's target
// grid, race chart and match stats.
import type { AtcDetail, CommittedVisit, MatchStats } from '../session/types.js'
import { advanceInSequence, hitCounts, hitsTarget, type ATCState } from './atc.js'
import { row, values } from './matchStats.js'

type Step = AtcDetail['progress'][number]['steps'][number]
type Throw = { target: number; hit: boolean }

const ROWS = [
  row('dartsThrown', 'Darts thrown', 'integer', null, { compact: true }),
  row('targetsHit', 'Targets hit', 'integer', 'higher', { compact: true }),
  row('hitRate', 'Hit rate', 'ratio', 'higher', { value: 'dartsHit', of: 'dartsThrown' }),
  row('firstDartHits', 'Hit with first dart', 'integer', 'higher', { compact: true }),
  row('longestStreak', 'Longest hit streak', 'integer', 'higher', { compact: true }),
  row('dartsPerTarget', 'Darts per target', 'decimal', 'lower'),
  row('hardestTarget', 'Hardest target', 'target', null, { compact: true }),
]

/** Every dart a seat threw, with the target it was aimed at; and the steps (targets reached). */
function walk(visits: CommittedVisit<ATCState>[], final: ATCState, seat: number): { throws: Throw[]; steps: Step[] } {
  const throws: Throw[] = []
  const steps: Step[] = []
  let current: Step | null = null
  for (const v of visits) {
    if (v.phase !== 'game' || v.seat !== seat) continue
    let target = v.start.targets[seat]
    for (const d of v.darts) {
      if (!final.sequence.includes(target)) break // finished
      if (!current || current.target !== target) {
        current = { target, darts: 0, hit: false }
        steps.push(current)
      }
      const hit = hitsTarget(target, { segment: d.segment, score: 0 })
      current.darts += 1
      throws.push({ target, hit })
      if (!hit) continue
      current.hit = true
      const stepsAhead = final.cfg.multiplierAdvances ? d.segment.multiplier : 1
      const next = advanceInSequence(target, stepsAhead, final.sequence)
      // Targets jumped over count as done with no darts
      const from = final.sequence.indexOf(target)
      const to = final.sequence.includes(next) ? final.sequence.indexOf(next) : final.sequence.length
      for (let i = from + 1; i < to; i++) steps.push({ target: final.sequence[i], darts: 0, hit: true })
      target = next
      current = null
    }
  }
  // The target it ended on, even without a dart at it yet
  const end = final.targets[seat]
  if (final.sequence.includes(end) && steps.at(-1)?.target !== end) steps.push({ target: end, darts: 0, hit: false })
  return { throws, steps }
}

export function atcProgress(visits: CommittedVisit<ATCState>[], final: ATCState): AtcDetail['progress'] {
  return Array.from({ length: final.playerCount }, (_, seat) => ({ seat, steps: walk(visits, final, seat).steps }))
}

/** Every dart the seat threw in the game phase, including any thrown after the winning dart. */
function dartsThrown(visits: CommittedVisit<ATCState>[], seat: number): number {
  return visits.filter(v => v.phase === 'game' && v.seat === seat).reduce((n, v) => n + v.darts.length, 0)
}

function longestStreak(throws: Throw[]): number {
  let best = 0,
    run = 0
  for (const t of throws) {
    run = t.hit ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

export function atcMatchStats(visits: CommittedVisit<ATCState>[], final: ATCState): MatchStats {
  const completed = hitCounts(final)
  return {
    rows: ROWS,
    seats: Array.from({ length: final.playerCount }, (_, seat) => {
      const { throws, steps } = walk(visits, final, seat)
      const thrownAt = steps.filter(s => s.darts > 0 && s.hit)
      const hardest = thrownAt.reduce<Step | null>((h, s) => (!h || s.darts > h.darts ? s : h), null)
      const darts = dartsThrown(visits, seat)
      return {
        index: seat,
        values: values({
          dartsThrown: darts,
          targetsHit: completed[seat],
          dartsHit: throws.filter(t => t.hit).length,
          firstDartHits: thrownAt.filter(s => s.darts === 1).length,
          longestStreak: longestStreak(throws),
          dartsPerTarget: completed[seat] > 0 ? darts / completed[seat] : undefined,
          hardestTarget: hardest?.target,
          reached: final.targets[seat],
          finished: completed[seat] === final.sequence.length ? 1 : 0,
        }),
      }
    }),
  }
}
