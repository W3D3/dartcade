// How long a bot waits between darts, and before takeout, per botSpeed setting. A random
// delay within the band (not a fixed one) so a visit doesn't look robotic.
export type BotSpeed = 'fast' | 'normal' | 'slow'

const BANDS: Record<BotSpeed, { betweenDarts: [number, number]; beforeTakeout: [number, number] }> = {
  fast: { betweenDarts: [400, 800], beforeTakeout: [300, 600] },
  normal: { betweenDarts: [1500, 2500], beforeTakeout: [800, 1500] },
  slow: { betweenDarts: [3000, 4500], beforeTakeout: [1500, 2500] },
}

/** A delay in ms, drawn from `rng` (0..1) within the band for `speed`. */
export function dartDelay(speed: BotSpeed, rng: () => number): number {
  const [lo, hi] = BANDS[speed].betweenDarts
  return Math.round(lo + rng() * (hi - lo))
}

/** The delay before takeout, once a visit is over. */
export function takeoutDelay(speed: BotSpeed, rng: () => number): number {
  const [lo, hi] = BANDS[speed].beforeTakeout
  return Math.round(lo + rng() * (hi - lo))
}
