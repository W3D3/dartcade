// Calibrated by `npm run calibrate:bots` (backend/src/bots/calibrate.ts) against
// ../shared/botLevels.ts's LEVEL_AVERAGE (the single source of truth for the target curve,
// also used wherever the frontend shows a level's expected average). Recalibrate and replace
// this array if accuracy.ts's targeting, throw, or sigma-jitter model changes.
export const LEVEL_SIGMA: readonly number[] = [0.20187, 0.15043, 0.11694, 0.09388, 0.07527, 0.06503, 0.05331, 0.04535, 0.03854, 0.0326]

/** The aiming sigma (board units) for a bot's level (1-10). */
export function sigmaForLevel(level: number): number {
  const i = Math.round(level) - 1
  if (i < 0 || i >= LEVEL_SIGMA.length) throw new Error(`bot level out of range: ${level}`)
  return LEVEL_SIGMA[i]
}
