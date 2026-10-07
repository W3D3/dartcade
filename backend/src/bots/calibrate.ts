// Offline tool: for a target 3-dart average, binary-search the aiming sigma that produces it
// over many simulated 501-double-out legs. Run with `npm run calibrate:bots` (backend/) and
// paste the printed LEVEL_SIGMA array into levels.ts. Not part of the running app.
import { pickTarget, throwAt } from './accuracy.js'
import { seededRng } from '../session/rng.js'
import { LEVEL_AVERAGE } from '../shared/botLevels.js'

const START = 501
const OUT_MODE = 'double'
const LEGS_PER_TRIAL = 300

/** One simulated leg at a given sigma: darts thrown, points scored (busts don't count). */
function simulateLeg(sigma: number, rng: () => number): { darts: number; points: number } {
  let remaining = START
  let darts = 0
  let points = 0
  let dartsThisVisit = 0
  let scoreAtVisitStart = remaining
  while (remaining > 0) {
    const dartsLeft = 3 - dartsThisVisit
    const target = pickTarget(remaining, dartsLeft, OUT_MODE)
    const { segment: seg } = throwAt(target, sigma, rng)
    darts++
    dartsThisVisit++
    const scored = seg.multiplier * (seg.number === 50 ? 25 : seg.number) // Bull=50 scores 50, not 25*2
    const value = seg.name === 'Bull' ? 50 : scored
    const next = remaining - value
    const bust = next < 0 || next === 1 || (next === 0 && seg.bed !== 'Double')
    if (bust) {
      remaining = scoreAtVisitStart
      dartsThisVisit = 3 // end the visit
    } else {
      remaining = next
    }
    if (dartsThisVisit >= 3 || remaining === 0) {
      dartsThisVisit = 0
      scoreAtVisitStart = remaining
    }
  }
  points = START - 0 // all 501 points were eventually scored to reach 0
  return { darts, points }
}

/** Long-run 3-dart average at a given sigma, over LEGS_PER_TRIAL legs. */
function averageAt(sigma: number, seed: number): number {
  const rng = seededRng(seed)
  let totalDarts = 0
  let totalPoints = 0
  for (let i = 0; i < LEGS_PER_TRIAL; i++) {
    const { darts, points } = simulateLeg(sigma, rng)
    totalDarts += darts
    totalPoints += points
  }
  return (totalPoints / totalDarts) * 3
}

/** The sigma (board units) producing `targetAvg`, by binary search. */
function calibrate(targetAvg: number, seed: number): number {
  let lo = 0.005
  let hi = 0.3
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const avg = averageAt(mid, seed)
    // Smaller sigma -> higher average (tighter grouping)
    if (avg > targetAvg) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

const sigmas = LEVEL_AVERAGE.map((avg, i) => calibrate(avg, 1000 + i))
console.log('LEVEL_SIGMA (paste into levels.ts):')
console.log(JSON.stringify(sigmas.map(s => Number(s.toFixed(5)))))
sigmas.forEach((s, i) => {
  console.log(`Level ${i + 1}: target ${LEVEL_AVERAGE[i]}, sigma ${s.toFixed(5)}, verified avg ${averageAt(s, 1000 + i).toFixed(1)}`)
})
