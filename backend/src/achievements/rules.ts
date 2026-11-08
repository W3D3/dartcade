// What one finished game adds to each achievement's count. Pure: it reads the same ChallengeGame
// the challenges do (progression/facts.ts), so typed-in darts count for neither.
import type { ChallengeGame, Seg } from '../progression/challenges.js'

const isBull = (s: Seg) => s.n === 25 && s.m === 2
const isDouble = (s: Seg) => s.m === 2

const x01Counters: Record<string, (g: ChallengeGame) => number> = {
  'x01.180': g => g.visits.filter(v => !v.bust && v.scored === 180).length,
  'x01.bigFish': g => g.checkouts.filter(c => c.value === 170).length,
  'x01.tonPlus': g => g.visits.filter(v => !v.bust && (v.scored ?? 0) >= 100).length,
  'x01.tonPlusOut': g => g.checkouts.filter(c => c.value >= 100).length,
  'x01.bedAndBreakfast': g => g.visits.filter(v => !v.bust && v.scored === 26).length,
  'x01.bullseye': g => g.visits.reduce((a, v) => a + v.segs.filter(isBull).length, 0),
  'x01.bullFinish': g => g.checkouts.filter(c => isBull(c.last)).length,
  'x01.doubleTheDoubles': g => g.checkouts.filter(c => isDouble(c.last) && c.prev !== undefined && isDouble(c.prev)).length,
  'x01.madhouse': g => g.checkouts.filter(c => c.last.n === 1 && isDouble(c.last)).length,
}

/** The achievement ids this game moved, with how much each count grows. Nothing for a game that doesn't qualify. */
export function achievementDeltas(g: ChallengeGame): Map<string, number> {
  const deltas = new Map<string, number>()
  if (!g.qualifies || g.mode !== 'x01') return deltas
  for (const [id, count] of Object.entries(x01Counters)) {
    const n = count(g)
    if (n > 0) deltas.set(id, n)
  }
  return deltas
}

/** The push promises the biggest tier first (the headline badge of the toast); ties keep the catalogue order. */
export function biggestTierFirst<T extends { tier: number }>(unlocked: T[]): T[] {
  return [...unlocked].sort((a, b) => b.tier - a.tier)
}
