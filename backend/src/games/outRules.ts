// How a dart scores against what's left: X01's in/out rules, shared by every countdown game (X01, 121).
import type { Dart } from '../session/types.js'

export type OutMode = 'straight' | 'double' | 'master'
export type BullValue = '25_50' | '50_50'

export function effectiveDartScore(dart: Dart, bullValue: BullValue): number {
  const { number, multiplier } = dart.segment
  if (multiplier === 0) return 0
  if (number === 25 && bullValue === '50_50') return 50
  return dart.score
}

// The bull counts as a double however it is reported (Board Manager and manual
// entry send number 50 with multiplier 1; its score is 50 either way).
export const isDouble = (dart: Dart) => dart.segment.multiplier === 2 || dart.segment.number === 50

/** The dart may open (check-in) or finish (check-out) a player under the mode. */
export function meetsMode(dart: Dart, mode: OutMode): boolean {
  if (mode === 'straight') return true
  if (mode === 'double') return isDouble(dart)
  return isDouble(dart) || dart.segment.multiplier === 3
}

/** Nothing can finish from 1 unless any dart may finish. */
export const deadEnd = (score: number, outMode: OutMode) => score === 1 && outMode !== 'straight'

/** The score left after `dart`, or 'bust' (below 0, a dead-end 1, or 0 without the out rule). */
export function scoreDart(left: number, dart: Dart, outMode: OutMode, bullValue: BullValue): number | 'bust' {
  const next = left - effectiveDartScore(dart, bullValue)
  if (next < 0 || deadEnd(next, outMode) || (next === 0 && !meetsMode(dart, outMode))) return 'bust'
  return next
}
