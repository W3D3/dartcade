// Shanghai's rounds, shared by the game and the SPA: round n aims at roundTargets(cfg)[n - 1].
export const BULL = 25

/** The numbers of the regular rounds, in order: start..end, then the bull. */
export const roundTargets = (cfg: { start: number; end: number; bullRound: boolean }): number[] => {
  const nums = Array.from({ length: cfg.end - cfg.start + 1 }, (_, i) => cfg.start + i)
  return cfg.bullRound ? [...nums, BULL] : nums
}

/** The number a round aims at; every round past the regular ones is a bull round. */
export const targetOf = (cfg: { start: number; end: number; bullRound: boolean }, round: number): number =>
  roundTargets(cfg)[round - 1] ?? BULL
