import { LEVEL_SIGMA } from '../shared/botLevels.js'

export { LEVEL_SIGMA }

/** The aiming sigma (board units) for a bot's level (1-20). */
export function sigmaForLevel(level: number): number {
  const i = Math.round(level) - 1
  if (i < 0 || i >= LEVEL_SIGMA.length) throw new Error(`bot level out of range: ${level}`)
  return LEVEL_SIGMA[i]
}
