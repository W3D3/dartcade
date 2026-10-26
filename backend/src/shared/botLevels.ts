// A bot's calibrated 3-dart average per level (1-10) — the single source of truth for both
// backend/src/bots/calibrate.ts's binary search and anywhere the frontend shows a level's
// expected skill (e.g. "Bot Lvl 7 (81 avg)"). Not itself a live statistic: see
// backend/src/bots/levels.ts for the sigma this was calibrated to reproduce.
export const LEVEL_AVERAGE: readonly number[] = [30, 38, 46, 54, 63, 72, 81, 90, 98, 105]

/** The calibrated average for a bot level (1-10); throws outside that range. */
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
