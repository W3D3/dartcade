// Catch 40's ladder and scoring, shared by the game module and the SPA.
export const FIRST_TARGET = 61
export const LAST_TARGET = 100
export const TARGETS = LAST_TARGET - FIRST_TARGET + 1
export const DARTS_PER_TARGET = 6
/** The target a 3-dart checkout scores full points on: 2 darts can't finish it. */
const HARD_TARGET = 99

/** Points for checking `target` out in `darts` (null: not checked out within the darts). */
export function pointsFor(target: number, darts: number | null): number {
  if (darts === null) return 0
  if (darts <= 2) return 3
  if (darts === 3) return target === HARD_TARGET ? 3 : 2
  return 1
}
