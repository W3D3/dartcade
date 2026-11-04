import { pickTarget, throwAt } from './accuracy.js'
import { seededRng } from '../session/rng.js'

/** The 501 three-dart average a bot of this aiming sigma throws over `legs` legs, seeded (a test helper) */
export function simulatedAverage(sigma: number, legs: number): number {
  const rng = seededRng(99)
  let darts = 0
  let visits501 = 0
  for (let i = 0; i < legs; i++) {
    let remaining = 501
    let dartsThisVisit = 0
    let scoreAtVisitStart = remaining
    while (remaining > 0) {
      const dartsLeft = 3 - dartsThisVisit
      const target = pickTarget(remaining, dartsLeft, 'double')
      const { segment: seg } = throwAt(target, sigma, rng)
      darts++
      dartsThisVisit++
      const value = seg.name === 'Bull' ? 50 : seg.multiplier * seg.number
      const next = remaining - value
      const bust = next < 0 || next === 1 || (next === 0 && seg.bed !== 'Double')
      remaining = bust ? scoreAtVisitStart : next
      if (bust || dartsThisVisit >= 3 || remaining === 0) {
        dartsThisVisit = 0
        scoreAtVisitStart = remaining
      }
    }
    visits501 += 501
  }
  return (visits501 / darts) * 3
}
