/** A random number generator: each call gives a number in [0, 1). */
export type Rng = () => number

/**
 * One mulberry32 step from `position`: the number in [0, 1) and the next position. A game that draws
 * as it goes (Dungeon) keeps the position in its state, so a replay draws the same numbers.
 */
export function roll(position: number): [number, number] {
  const next = (position + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

/** A generator that starts at `position`; `position()` says where it stopped, to store back. */
export function drawFrom(position: number): { rng: Rng; position: () => number } {
  let at = position >>> 0
  return {
    rng: () => {
      const [value, next] = roll(at)
      at = next
      return value
    },
    position: () => at,
  }
}

/**
 * mulberry32: a small deterministic PRNG. A game's random setup (ATC's random order)
 * uses one seeded per game, so replaying the game's log rebuilds the same game.
 */
export const seededRng = (seed: number): Rng => drawFrom(seed).rng

/** An index in [0, n). */
export const pick = (rng: Rng, n: number): number => Math.floor(rng() * n)

/** A shuffled copy (Fisher–Yates): the same order for the same generator state. */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
