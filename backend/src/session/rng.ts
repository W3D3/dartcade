import type { Rng } from '../shared/rng.js'

export { seededRng, type Rng } from '../shared/rng.js'

/** A fresh seed for a new game. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

/** A shuffled copy (Fisher–Yates): the same order for the same generator state. */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
