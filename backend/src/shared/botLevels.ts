// A bot's calibrated 3-dart average per level (1-20) — the single source of truth for both
// backend/src/bots/calibrate.ts's binary search and anywhere the frontend shows a level's
// expected skill (e.g. "Bot Level 13 (80 avg)"). Not itself a live statistic: see
// LEVEL_SIGMA below for the sigma this was calibrated to reproduce.
// Level n averages 15 + 5n (20 … 115); the best a perfect-aim bot reaches is far above that.
export const LEVEL_AVERAGE: readonly number[] = Array.from({ length: 20 }, (_, i) => 20 + 5 * i)

// Each level's aiming sigma (board units), calibrated by `npm run calibrate:bots`
// (backend/src/bots/calibrate.ts) to reproduce LEVEL_AVERAGE. Kept here, not in bots/, so the
// coach (shared with the frontend) can read a player's expected spread from it. Recalibrate and
// replace this array if bots/accuracy.ts's targeting, throw, or sigma-jitter model changes.
export const LEVEL_SIGMA: readonly number[] = [
  0.29867, 0.23168, 0.19806, 0.16652, 0.13718, 0.12266, 0.10531, 0.09414, 0.08246, 0.07438, 0.06748, 0.06041, 0.05529, 0.05001, 0.04574,
  0.04196, 0.03693, 0.03239, 0.02994, 0.0265,
]

/** The spread of a bot dart's log-normal sigma multiplier (bots/accuracy.ts), calibrated with LEVEL_SIGMA */
export const SIGMA_JITTER = 0.5

/** The aiming sigma (board units, per axis) of a player with this 3-dart average: the bots'
 *  calibration, log-linear between levels, clamped outside them (the coach reads players far
 *  off the table, so no extrapolating). A dart still gets the SIGMA_JITTER multiplier on top,
 *  as a bot's does. */
export function sigmaForAverage(average: number): number {
  const last = LEVEL_AVERAGE.length - 1
  if (average <= LEVEL_AVERAGE[0]) return LEVEL_SIGMA[0]
  if (average >= LEVEL_AVERAGE[last]) return LEVEL_SIGMA[last]
  const i = LEVEL_AVERAGE.findIndex(a => a > average) - 1
  const t = (average - LEVEL_AVERAGE[i]) / (LEVEL_AVERAGE[i + 1] - LEVEL_AVERAGE[i])
  return Math.exp(Math.log(LEVEL_SIGMA[i]) + t * (Math.log(LEVEL_SIGMA[i + 1]) - Math.log(LEVEL_SIGMA[i])))
}

/** The calibrated average for a bot level (1-20); throws outside that range. */
export function averageForLevel(level: number): number {
  const i = Math.round(level) - 1
  if (i < 0 || i >= LEVEL_AVERAGE.length) throw new Error(`bot level out of range: ${level}`)
  return LEVEL_AVERAGE[i]
}

/**
 * What the lobby says about a bot's level: X01's calibrated average is the number that
 * actually means something there; every other game just names the level, since X01's average
 * doesn't describe how the bot plays Cricket, Higher Lower, etc.
 */
export function botLevelLabel(level: number, gameId: string | undefined): string {
  return gameId === 'x01' ? `${averageForLevel(level)} avg` : `Level ${Math.round(level)}`
}
