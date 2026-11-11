import { seededRng, shuffle } from '../rng.js'

/** A tournament entry (a player or a team) as the draw sees it. */
export interface Seedable {
  readonly id: string
  /** Higher seeds first when seeding by rating; an entry without one is seeded last. */
  readonly rating: number | null
}

export type Seeding =
  | { readonly by: 'rating' }
  | { readonly by: 'random'; readonly seed: number }
  /** The organizer's order, seed 1 first: every entry exactly once. */
  | { readonly by: 'manual'; readonly order: readonly string[] }

export interface Side {
  /** The entry playing here: null until the source match is decided, or for a bye. */
  readonly entry: string | null
  /** The match whose winner fills this side; null when the draw placed the entry directly. */
  readonly source: string | null
}

/** How a match was decided: what a caller reports to {@link advance}. */
export type MatchResult =
  | { readonly outcome: 'played'; readonly winner: 0 | 1; readonly legs: readonly [number, number] }
  | { readonly outcome: 'walkover'; readonly winner: 0 | 1 }

/** A bye is decided by the draw: the side with an entry goes through without playing. */
export type Result = MatchResult | { readonly outcome: 'bye'; readonly winner: 0 | 1 }

export interface Match {
  /** Stable within a bracket, e.g. `R2M3`: other matches' sides refer to it as `source`. */
  readonly key: string
  /** 1-based. */
  readonly round: number
  /** 1-based position within the round, top of the bracket first. */
  readonly index: number
  readonly firstTo: number
  readonly sides: readonly [Side, Side]
  readonly result: Result | null
}

export interface MatchLength {
  readonly firstTo: number
  /** Longer final: the final's length, and the semi-finals' too when `semis`. */
  readonly final?: { readonly firstTo: number; readonly semis: boolean }
}

// Finite, so two missing values compare equal (-Infinity - -Infinity is NaN).
const LOWEST = -Number.MAX_VALUE

/** Entry ids in seed order, seed 1 first. */
export function seedEntries(entries: readonly Seedable[], seeding: Seeding): string[] {
  const ids = entries.map(e => e.id)
  if (new Set(ids).size !== ids.length) throw new Error('duplicate entry')
  switch (seeding.by) {
    case 'rating':
      // Array.prototype.sort is stable, so equal ratings keep the entries' order.
      return [...entries].sort((a, b) => (b.rating ?? LOWEST) - (a.rating ?? LOWEST)).map(e => e.id)
    case 'random':
      return shuffle(ids, seededRng(seeding.seed))
    case 'manual': {
      const order = seeding.order
      if (order.length !== ids.length || new Set(order).size !== order.length || !order.every(id => ids.includes(id)))
        throw new Error('manual seeding must list every entry once')
      return [...order]
    }
  }
}

const matchKey = (round: number, index: number) => `R${round}M${index}`

/**
 * Seed numbers in bracket order, two per first-round match, so seeds 1 and 2 can only
 * meet in the final: [1, 2] → [1, 4, 2, 3] → [1, 8, 4, 5, 2, 7, 3, 6] …
 */
function bracketOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap(s => [s, n + 1 - s])
  }
  return order
}

function firstToFor(round: number, rounds: number, length: MatchLength): number {
  const fromEnd = rounds - round
  if (length.final && (fromEnd === 0 || (fromEnd === 1 && length.final.semis))) return length.final.firstTo
  return length.firstTo
}

/**
 * The single-elimination draw for entries in seed order. A field that isn't a power of two
 * is filled with byes against the top seeds; those matches are decided as `bye` and their
 * winners already stand in round 2.
 */
export function singleElimination(seeded: readonly string[], length: MatchLength): Match[] {
  if (seeded.length < 2) throw new Error('a bracket needs at least two entries')
  const rounds = Math.ceil(Math.log2(seeded.length))
  const order = bracketOrder(2 ** rounds)
  let matches: Match[] = []
  for (let round = 1; round <= rounds; round++) {
    const count = 2 ** (rounds - round)
    for (let index = 1; index <= count; index++) {
      const drawn = (k: 0 | 1): Side => ({ entry: seeded[order[2 * index - 2 + k] - 1] ?? null, source: null })
      const sides: [Side, Side] =
        round === 1
          ? [drawn(0), drawn(1)]
          : [
              { entry: null, source: matchKey(round - 1, 2 * index - 1) },
              { entry: null, source: matchKey(round - 1, 2 * index) },
            ]
      matches.push({ key: matchKey(round, index), round, index, firstTo: firstToFor(round, rounds, length), sides, result: null })
    }
  }
  // A field over half the bracket never puts two byes in one match.
  for (const m of matches.filter(m => m.round === 1 && m.sides.some(s => s.entry === null))) {
    matches = decide(matches, m, { outcome: 'bye', winner: m.sides[0].entry === null ? 1 : 0 })
  }
  return matches
}

/**
 * Round robin by the circle method: every pair meets exactly once, everyone plays once per
 * round, and with an odd field one entry sits each round out.
 */
export function roundRobin(seeded: readonly string[], firstTo: number): Match[] {
  if (seeded.length < 2) throw new Error('a round robin needs at least two entries')
  let circle: (string | null)[] = seeded.length % 2 === 0 ? [...seeded] : [...seeded, null]
  const n = circle.length
  const matches: Match[] = []
  for (let round = 1; round < n; round++) {
    let index = 0
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i]
      const b = circle[n - 1 - i]
      if (a === null || b === null) continue
      index++
      matches.push({
        key: matchKey(round, index),
        round,
        index,
        firstTo,
        sides: [
          { entry: a, source: null },
          { entry: b, source: null },
        ],
        result: null,
      })
    }
    circle = [circle[0], circle[n - 1], ...circle.slice(1, n - 1)]
  }
  return matches
}

function decide(matches: readonly Match[], decided: Match, result: Result): Match[] {
  const winner = decided.sides[result.winner].entry
  const fill = (s: Side): Side => (s.source === decided.key ? { ...s, entry: winner } : s)
  return matches.map(m => {
    if (m.key === decided.key) return { ...m, result }
    if (!m.sides.some(s => s.source === decided.key)) return m
    return { ...m, sides: [fill(m.sides[0]), fill(m.sides[1])] }
  })
}

/** Records a match's result and moves its winner into the match its `source` feeds. */
export function advance(matches: readonly Match[], key: string, result: MatchResult): Match[] {
  const m = matches.find(x => x.key === key)
  if (!m) throw new Error(`no match ${key}`)
  if (m.result) throw new Error(`match ${key} is already decided`)
  if (m.sides.some(s => s.entry === null)) throw new Error(`match ${key} is still waiting for an entry`)
  if (result.outcome === 'played') {
    const won = result.legs[result.winner]
    const lost = result.legs[1 - result.winner]
    if (!Number.isInteger(lost) || lost < 0 || lost >= m.firstTo || won !== m.firstTo)
      throw new Error(`legs ${result.legs.join('-')} don't finish a first to ${m.firstTo}`)
  }
  return decide(matches, m, result)
}

/** Match wins, then leg difference, then legs won: the tie-breaks that need no other entry. */
const byRecord = (a: Standing, b: Standing) => b.won - a.won || b.legsWon - b.legsLost - (a.legsWon - a.legsLost) || b.legsWon - a.legsWon

export interface Standing {
  readonly entry: string
  readonly played: number
  readonly won: number
  readonly lost: number
  readonly legsWon: number
  readonly legsLost: number
}

/**
 * The table of a round robin (or a group), best first. Ties go to match wins, then leg
 * difference, then legs won, then the wins among the tied entries, then the 3-dart average,
 * then the seed order of `entries`, so the order is always the same.
 */
export function standings(
  matches: readonly Match[],
  entries: readonly string[],
  averages: ReadonlyMap<string, number> = new Map(),
): Standing[] {
  const rows = entries.map((entry, seed) => ({
    entry,
    played: 0,
    won: 0,
    lost: 0,
    legsWon: 0,
    legsLost: 0,
    headToHead: 0,
    average: averages.get(entry) ?? LOWEST,
    seed,
  }))
  const byEntry = new Map(rows.map(row => [row.entry, row]))
  const games = matches.flatMap(({ sides: [a, b], result }) => {
    if (!result || result.outcome === 'bye') return []
    const pair = [a, b].map(side => {
      const row = side.entry === null ? undefined : byEntry.get(side.entry)
      if (!row) throw new Error(`${side.entry} is not in the table`)
      return row
    })
    return [{ pair, result }]
  })
  for (const { pair, result } of games) {
    pair.forEach((row, i) => {
      row.played++
      if (result.winner === i) row.won++
      else row.lost++
      if (result.outcome === 'played') {
        row.legsWon += result.legs[i]
        row.legsLost += result.legs[1 - i]
      }
    })
  }
  for (const { pair, result } of games) {
    if (byRecord(pair[0], pair[1]) === 0) pair[result.winner].headToHead++
  }
  return rows
    .sort((a, b) => byRecord(a, b) || b.headToHead - a.headToHead || b.average - a.average || a.seed - b.seed)
    .map(({ entry, played, won, lost, legsWon, legsLost }) => ({ entry, played, won, lost, legsWon, legsLost }))
}

/** A knockout round's name: `Quarter-finals` / `QF`, or `Round 2` / `R2` further out. */
export function roundName(round: number, rounds: number): { readonly name: string; readonly short: string } {
  switch (rounds - round) {
    case 0:
      return { name: 'Final', short: 'Final' }
    case 1:
      return { name: 'Semi-finals', short: 'SF' }
    case 2:
      return { name: 'Quarter-finals', short: 'QF' }
    default:
      return { name: `Round ${round}`, short: `R${round}` }
  }
}
