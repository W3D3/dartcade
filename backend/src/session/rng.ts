/** A random number generator: each call gives a number in [0, 1). */
export type Rng = () => number

/**
 * mulberry32: a small deterministic PRNG. A game's random setup (ATC's random order)
 * uses one seeded per game, so replaying the game's log rebuilds the same game.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fresh seed for a new game. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
