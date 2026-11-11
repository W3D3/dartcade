export { seededRng, shuffle, type Rng } from '../shared/rng.js'

/** A fresh seed for a new game. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
