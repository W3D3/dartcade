// Calibrated by `npm run calibrate:bots` (backend/src/bots/calibrate.ts) against the targets
// 30, 38, 46, 54, 63, 72, 81, 90, 98, 105 (3-dart average, Level 1 through 10). Recalibrate
// and replace this array if accuracy.ts's targeting or throw model changes.
export const LEVEL_SIGMA: readonly number[] = [
  0.17034, 0.12446, 0.10555, 0.08692, 0.07072, 0.06289, 0.05226, 0.04466, 0.03877, 0.03374,
]

/** The aiming sigma (board units) for a bot's level (1-10). */
export function sigmaForLevel(level: number): number {
  const i = Math.round(level) - 1
  if (i < 0 || i >= LEVEL_SIGMA.length) throw new Error(`bot level out of range: ${level}`)
  return LEVEL_SIGMA[i]
}
