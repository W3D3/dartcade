import type { RankedMode } from '../shared/ranked.js'

/** The rating range a search starts with, in RP either way. */
export const START_RANGE = 75
/** How much the range widens, and how often. */
export const RANGE_STEP = 75
export const RANGE_STEP_MS = 30_000
/** The range stops widening here. */
export const MAX_RANGE = 600

export type FirstTo = 2 | 3

/** One search: a solo player (1v1), or a duo (2v2) that the host started. */
export type Entry = {
  id: string
  mode: RankedMode
  /** The host first. */
  userIds: string[]
  /** The side's rating: its players' average (shared/ranked.ts sideRating). */
  rating: number
  /** First to 3 is played only when both sides picked it. */
  firstTo: FirstTo
  /** When the search started, in ms; kept when a match falls through, so it keeps its place. */
  since: number
}

/** How far from its rating a search accepts an opponent after searching until `now`. */
export function rangeOf(entry: Pick<Entry, 'since'>, now: number): number {
  const steps = Math.floor(Math.max(0, now - entry.since) / RANGE_STEP_MS)
  return Math.min(MAX_RANGE, START_RANGE + steps * RANGE_STEP)
}

/**
 * Pairs searches of the same mode whose ratings are within both of their ranges. The longest
 * search goes first and takes the closest rating it accepts; ties go to whoever searched longer.
 * Every search is in at most one pair.
 */
export function findMatches<E extends Entry>(entries: readonly E[], now: number): [E, E][] {
  const waiting = [...entries].sort((a, b) => a.since - b.since || a.id.localeCompare(b.id))
  const taken = new Set<string>()
  const pairs: [E, E][] = []
  for (const a of waiting) {
    if (taken.has(a.id)) continue
    let best: E | undefined
    for (const b of waiting) {
      if (b === a || taken.has(b.id) || b.mode !== a.mode) continue
      if (b.userIds.some(u => a.userIds.includes(u))) continue
      const gap = Math.abs(a.rating - b.rating)
      if (gap > Math.min(rangeOf(a, now), rangeOf(b, now))) continue
      if (!best || gap < Math.abs(a.rating - best.rating)) best = b
    }
    if (best) {
      taken.add(a.id)
      taken.add(best.id)
      pairs.push([a, best])
    }
  }
  return pairs
}

/** First to 3 only when both sides picked it, else First to 2. */
export function matchFirstTo(a: Pick<Entry, 'firstTo'>, b: Pick<Entry, 'firstTo'>): FirstTo {
  return a.firstTo === 3 && b.firstTo === 3 ? 3 : 2
}
