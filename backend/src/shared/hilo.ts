import { MAX_VISIT } from './darts.js'

/** A total that can take any further dart (it's a miss-proof position): above the high bar,
 *  or already matching a 180 high bar with the extremes option. */
export function safeHigh(total: number, high: number, matchExtremes: boolean): boolean {
  return total > high || (matchExtremes && high === MAX_VISIT && total === MAX_VISIT)
}

/** Mirror of `safeHigh`: below the low bar, or already matching a 0 low bar with the extremes option. */
export function safeLow(total: number, low: number, matchExtremes: boolean): boolean {
  return total < low || (matchExtremes && low === 0 && total === 0)
}
