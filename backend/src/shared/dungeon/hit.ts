// A dart as Dungeon reads it, and the board geometry its rules use (sides for the vote, the opposite
// and the clockwise neighbour of a number).
import { SEGS } from '../board.js'

/** Where a dart landed: `bull` is the outer bull (25), `bullseye` the inner one (50). */
export type Ring = 'single' | 'double' | 'treble' | 'bull' | 'bullseye' | 'miss'

/** A dart: the number (1-20, 25 for either bull, 0 for a miss), its ring and its board score. */
export type Hit = { number: number; ring: Ring; score: number }

export const MISS: Hit = { number: 0, ring: 'miss', score: 0 }

/** The hit of a dart as the board (or the keypad) reports its segment. */
export function hitOf(segment: { number: number; multiplier: number; bed: string }): Hit {
  if (segment.bed === 'Outside' || segment.multiplier === 0) return MISS
  if (segment.number === 50) return { number: 25, ring: 'bullseye', score: 50 }
  if (segment.number === 25)
    return segment.multiplier === 2 ? { number: 25, ring: 'bullseye', score: 50 } : { number: 25, ring: 'bull', score: 25 }
  const ring: Ring = segment.multiplier === 3 ? 'treble' : segment.multiplier === 2 ? 'double' : 'single'
  return { number: segment.number, ring, score: segment.number * segment.multiplier }
}

export type Side = 'left' | 'right'

const LEFT = new Set([19, 7, 16, 8, 11, 14, 9, 12, 5])
const RIGHT = new Set([1, 18, 4, 13, 6, 10, 15, 2, 17])

/** The half of the board a hit votes for; 20, 3, the bull and a miss vote for neither. */
export function sideOf(hit: Hit): Side | null {
  if (LEFT.has(hit.number)) return 'left'
  if (RIGHT.has(hit.number)) return 'right'
  return null
}

const at = (n: number) => SEGS.indexOf(n)

/** The number half a turn away (20 and 3); null for the bull and a miss. */
export const opposite = (n: number): number | null => (at(n) < 0 ? null : SEGS[(at(n) + 10) % 20])

/** The next number clockwise (20 to 1); null for the bull and a miss. */
export const clockwise = (n: number): number | null => (at(n) < 0 ? null : SEGS[(at(n) + 1) % 20])

/** A board spot an enemy is weak to, resists or is immune to: a number, or a ring of any number. */
export type Spot = { number: number } | { ring: Exclude<Ring, 'miss'> }

/** Whether the hit lands on the spot (`bull` covers both bulls). */
export function onSpot(hit: Hit, spot: Spot): boolean {
  if (hit.ring === 'miss') return false
  if ('number' in spot) return hit.number === spot.number
  return spot.ring === 'bull' ? hit.number === 25 : hit.ring === spot.ring
}
