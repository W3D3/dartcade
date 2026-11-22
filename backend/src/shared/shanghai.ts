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

export type ShanghaiKind = 'single' | 'double' | 'treble'
/** Which of single, double and treble of the round's number a visit has landed. */
export type Hits = Record<ShanghaiKind, boolean>

/** The kinds a round can score: the bull has no treble. */
export const kindsOf = (target: number): ShanghaiKind[] => (target === BULL ? ['single', 'double'] : ['single', 'double', 'treble'])

export const isShanghai = (h: Hits): boolean => h.single && h.double && h.treble

/** What a dart scores on the round's target and which kind it was; the bull round takes 25 (single) and 50 (double). */
export function dartResult(
  dart: { segment: { number: number; multiplier: number } },
  target: number,
): { score: number; kind: ShanghaiKind | null } {
  const { number, multiplier } = dart.segment
  if (multiplier === 0) return { score: 0, kind: null }
  if (target === BULL) {
    if (number === 50) return { score: 50, kind: 'double' }
    return number === BULL ? { score: 25, kind: 'single' } : { score: 0, kind: null }
  }
  if (number !== target) return { score: 0, kind: null }
  return { score: target * multiplier, kind: multiplier === 1 ? 'single' : multiplier === 2 ? 'double' : 'treble' }
}
