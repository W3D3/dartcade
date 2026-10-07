// Calibrated by `npm run calibrate:bots` (backend/src/bots/calibrate.ts) against the targets
// 30, 38, 46, 54, 63, 72, 81, 90, 98, 105 (3-dart average, Level 1 through 10). Recalibrate
// and replace this array if accuracy.ts's targeting, throw, or sigma-jitter model changes.
export const LEVEL_SIGMA: readonly number[] = [0.20187, 0.15043, 0.11694, 0.09388, 0.07527, 0.06503, 0.05331, 0.04535, 0.03854, 0.0326]

/** The aiming sigma (board units) for a bot's level (1-10). */
export function sigmaForLevel(level: number): number {
  const i = Math.round(level) - 1
  if (i < 0 || i >= LEVEL_SIGMA.length) throw new Error(`bot level out of range: ${level}`)
  return LEVEL_SIGMA[i]
}
