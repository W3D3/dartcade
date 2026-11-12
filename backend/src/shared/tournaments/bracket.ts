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

/** Where a side's entry comes from once the draw is made. */
export type Source =
  /** The winner of a match, or its loser: a double elimination's drop into the lower bracket. */
  | { readonly from: 'winner' | 'loser'; readonly match: string }
  /** A group's place (1 = the group's winner), filled by {@link fillKnockout}. */
  | { readonly from: 'group'; readonly group: number; readonly place: number }

export interface Side {
  /** The entry playing here: null until its source is decided, or nobody (a bye). */
  readonly entry: string | null
  /** Null when the draw placed the entry directly. */
  readonly source: Source | null
}

/** How a match was decided: what a caller reports to {@link advance}. */
export type MatchResult =
  | { readonly outcome: 'played'; readonly winner: 0 | 1; readonly legs: readonly [number, number] }
  | { readonly outcome: 'walkover'; readonly winner: 0 | 1 }

/** A bye is decided by the draw: the side with an entry goes through without playing. */
export type Result = MatchResult | { readonly outcome: 'bye'; readonly winner: 0 | 1 }

/** `main` is the knockout (or a whole round robin); `lower` and `final` belong to a double elimination. */
export type Bracket = 'main' | 'lower' | 'final' | 'group'

/** The order brackets are played and listed in: groups, the knockout (upper), the lower bracket, the grand final. */
export const BRACKET_ORDER: Record<Bracket, number> = { group: 0, main: 1, lower: 2, final: 3 }

export interface Match {
  /**
   * Unique within the draw, e.g. `R2M3`, `L4M1` (lower bracket), `GF1`/`GF2` (grand final and
   * its reset), `G2R1M1` (group 2): other matches' sides refer to it as their source.
   */
  readonly key: string
  readonly bracket: Bracket
  /** 1-based; set for a group match only. */
  readonly group: number | null
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

function matchKey(bracket: Bracket, group: number | null, round: number, index: number): string {
  switch (bracket) {
    case 'main':
      return `R${round}M${index}`
    case 'lower':
      return `L${round}M${index}`
    case 'final':
      return `GF${round}`
    case 'group':
      return `G${group}R${round}M${index}`
  }
}

const winnerOf = (bracket: Bracket, round: number, index: number): Source => ({
  from: 'winner',
  match: matchKey(bracket, null, round, index),
})
const loserOf = (bracket: Bracket, round: number, index: number): Source => ({
  from: 'loser',
  match: matchKey(bracket, null, round, index),
})
const drawn = (entry: string | null): Side => ({ entry, source: null })
const fed = (source: Source): Side => ({ entry: null, source })

function match(bracket: Bracket, group: number | null, round: number, index: number, firstTo: number, sides: readonly [Side, Side]): Match {
  return { key: matchKey(bracket, group, round, index), bracket, group, round, index, firstTo, sides, result: null }
}

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

/** The first round of a knockout for entries in seed order: byes (null) against the top seeds. */
function firstRound<T>(seeded: readonly T[]): (readonly [T | null, T | null])[] {
  const order = bracketOrder(2 ** Math.ceil(Math.log2(seeded.length)))
  return Array.from({ length: order.length / 2 }, (_, i) => [seeded[order[2 * i] - 1] ?? null, seeded[order[2 * i + 1] - 1] ?? null])
}

function firstToFor(round: number, rounds: number, length: MatchLength): number {
  const fromEnd = rounds - round
  if (length.final && (fromEnd === 0 || (fromEnd === 1 && length.final.semis))) return length.final.firstTo
  return length.firstTo
}

/** A knockout from its first round: every later match takes the winners of the two before it. */
function knockout(round1: readonly (readonly [Side, Side])[], length: MatchLength): Match[] {
  const rounds = Math.log2(round1.length) + 1
  const matches: Match[] = []
  for (let round = 1; round <= rounds; round++) {
    for (let index = 1; index <= 2 ** (rounds - round); index++) {
      const sides =
        round === 1
          ? round1[index - 1]
          : ([fed(winnerOf('main', round - 1, 2 * index - 1)), fed(winnerOf('main', round - 1, 2 * index))] as const)
      matches.push(match('main', null, round, index, firstToFor(round, rounds, length), sides))
    }
  }
  return matches
}

const drawnRound = (seeded: readonly string[]) => firstRound(seeded).map(([a, b]) => [drawn(a), drawn(b)] as const)

/**
 * The single-elimination draw for entries in seed order. A field that isn't a power of two
 * is filled with byes against the top seeds; those matches are decided as `bye` and their
 * winners already stand in round 2.
 */
export function singleElimination(seeded: readonly string[], length: MatchLength): Match[] {
  if (seeded.length < 2) throw new Error('a bracket needs at least two entries')
  return settle(knockout(drawnRound(seeded), length))
}

/**
 * The double-elimination draw: the winners' bracket is the single-elimination draw (bracket
 * `main`), each of its losers drops into the `lower` bracket, and the two brackets' winners meet
 * in the grand final `GF1`. Odd lower rounds pair the lower bracket's survivors; even ones bring
 * in the next winners' round's losers, reversed or half-swapped so a dropped entry doesn't meet
 * the side of the bracket it just came from. If the lower bracket's winner takes `GF1`, the reset
 * `GF2` decides it; otherwise `GF2` leaves the draw. A longer final is the grand final's length,
 * and with `semis` the length of the winners' and lower brackets' finals too.
 */
export function doubleElimination(seeded: readonly string[], length: MatchLength): Match[] {
  if (seeded.length < 3) throw new Error('a double elimination needs at least three entries')
  const longer = length.final?.semis ? length.final.firstTo : length.firstTo
  const upper = knockout(drawnRound(seeded), { firstTo: length.firstTo, final: { firstTo: longer, semis: false } })
  const upperRounds = upper[upper.length - 1].round
  const lowerRounds = 2 * (upperRounds - 1)
  const lower: Match[] = []
  for (let round = 1; round <= lowerRounds; round++) {
    // Rounds 1 and 2 have a quarter of the field's slots, then every second round halves.
    const count = 2 ** (upperRounds - 1 - Math.ceil(round / 2))
    for (let index = 1; index <= count; index++) {
      let sides: readonly [Side, Side]
      if (round === 1) {
        sides = [fed(loserOf('main', 1, 2 * index - 1)), fed(loserOf('main', 1, 2 * index))]
      } else if (round % 2 === 1) {
        sides = [fed(winnerOf('lower', round - 1, 2 * index - 1)), fed(winnerOf('lower', round - 1, 2 * index))]
      } else {
        const drop = round / 2
        const from = drop % 2 === 1 ? count + 1 - index : ((index - 1 + (count >> 1)) % count) + 1
        sides = [fed(winnerOf('lower', round - 1, index)), fed(loserOf('main', drop + 1, from))]
      }
      lower.push(match('lower', null, round, index, round === lowerRounds ? longer : length.firstTo, sides))
    }
  }
  const finalTo = length.final?.firstTo ?? length.firstTo
  const final = match('final', null, 1, 1, finalTo, [fed(winnerOf('main', upperRounds, 1)), fed(winnerOf('lower', lowerRounds, 1))])
  // The winners' bracket's champion on side 0 again, now with a loss.
  const reset = match('final', null, 2, 1, finalTo, [fed(loserOf('final', 1, 1)), fed(winnerOf('final', 1, 1))])
  return settle([...upper, ...lower, final, reset])
}

/**
 * Round robin by the circle method: every pair meets exactly once, everyone plays once per
 * round, and with an odd field one entry sits each round out.
 */
export function roundRobin(seeded: readonly string[], firstTo: number): Match[] {
  return circle(seeded, firstTo, null)
}

function circle(seeded: readonly string[], firstTo: number, group: number | null): Match[] {
  if (seeded.length < 2) throw new Error('a round robin needs at least two entries')
  let ring: (string | null)[] = seeded.length % 2 === 0 ? [...seeded] : [...seeded, null]
  const n = ring.length
  const matches: Match[] = []
  for (let round = 1; round < n; round++) {
    let index = 0
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i]
      const b = ring[n - 1 - i]
      if (a === null || b === null) continue
      index++
      matches.push(match(group === null ? 'main' : 'group', group, round, index, firstTo, [drawn(a), drawn(b)]))
    }
    ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)]
  }
  return matches
}

export interface GroupStage {
  /** Entries per group; the field is split into as few groups as fit, so some may have one less. */
  readonly size: 3 | 4 | 5
  /** How many of each group go through to the knockout. */
  readonly through: 1 | 2
}

/** Each group's entries in seed order, snake-seeded: 1 2 3 4 | 8 7 6 5 | 9 10 11 12 … across the groups. */
export function snakeGroups(seeded: readonly string[], size: number): string[][] {
  const count = Math.ceil(seeded.length / size)
  const groups: string[][] = Array.from({ length: count }, () => [])
  seeded.forEach((entry, i) => {
    const at = i % count
    groups[Math.floor(i / count) % 2 === 0 ? at : count - 1 - at].push(entry)
  })
  return groups
}

interface Place {
  readonly group: number
  readonly place: number
}

/**
 * Groups + knockout: a round robin in each of the {@link snakeGroups} (bracket `group`), then a
 * single-elimination knockout (`main`) of the top `through` of every group, which waits for
 * {@link fillKnockout}. Group winners are the knockout's top seeds, so any byes are theirs, and
 * runners-up are placed so two entries of one group meet as late as the bracket allows. The
 * longer final applies to the knockout only.
 */
export function groupsKnockout(seeded: readonly string[], stage: GroupStage, length: MatchLength): Match[] {
  const groups = snakeGroups(seeded, stage.size)
  if (groups.length * stage.through < 2) throw new Error('the knockout needs at least two entries')
  if (groups.some(g => g.length <= stage.through)) throw new Error('every group needs more entries than go through')
  const side = (p: Place | null): Side => (p ? fed({ from: 'group', ...p }) : drawn(null))
  const round1 = firstRound(knockoutSeeds(groups.length, stage.through)).map(([a, b]) => [side(a), side(b)] as const)
  return settle([...groups.flatMap((g, i) => circle(g, length.firstTo, i + 1)), ...knockout(round1, length)])
}

/**
 * The knockout's seeds: the group winners by group, then the runners-up in group order rotated
 * by the shift that keeps every runner-up away from its own group's winner the longest.
 */
function knockoutSeeds(groups: number, through: 1 | 2): Place[] {
  const winners = Array.from({ length: groups }, (_, i) => ({ group: i + 1, place: 1 }))
  if (through === 1) return winners
  const order = bracketOrder(2 ** Math.ceil(Math.log2(2 * groups)))
  const slot = (seed: number) => order.indexOf(seed)
  // Two slots share a match first in the round of their highest differing bit.
  const meet = (a: number, b: number) => Math.floor(Math.log2(slot(a) ^ slot(b))) + 1
  let best: Place[] = []
  let latest = 0
  for (let shift = 0; shift < groups; shift++) {
    const runnersUp = winners.map((_, i) => ({ group: ((i + shift) % groups) + 1, place: 2 }))
    const earliest = Math.min(...runnersUp.map((r, i) => meet(r.group, groups + i + 1)))
    if (earliest > latest) {
      best = [...winners, ...runnersUp]
      latest = earliest
    }
  }
  return best
}

const isDecided = (matches: readonly Match[], source: Source | null) =>
  source === null || (source.from !== 'group' && matches.some(m => m.key === source.match && m.result))

/** Nobody will play here: a bye in the draw, or a decided source with no entry for this side. */
const isEmpty = (matches: readonly Match[], side: Side) => side.entry === null && isDecided(matches, side.source)

function decide(matches: readonly Match[], decided: Match, result: Result): Match[] {
  const moving = { winner: decided.sides[result.winner].entry, loser: decided.sides[1 - result.winner].entry }
  const fill = (s: Side): Side =>
    s.source && s.source.from !== 'group' && s.source.match === decided.key ? { ...s, entry: moving[s.source.from] } : s
  const next = matches.map(m => (m.key === decided.key ? { ...m, result } : { ...m, sides: [fill(m.sides[0]), fill(m.sides[1])] as const }))
  // The winners' bracket's champion takes the grand final at the first go: no reset.
  const reset = decided.bracket === 'final' && decided.round === 1 && result.winner === 0
  return settle(reset ? next.filter(m => m.key !== matchKey('final', null, 2, 1)) : next)
}

/**
 * Decides as `bye` every match with nobody on a side and its other side known. With nobody on
 * either side, the bye moves nobody on, which can empty a later match in turn.
 */
function settle(matches: readonly Match[]): Match[] {
  const bye = matches.find(
    m => !m.result && m.sides.some(s => isEmpty(matches, s)) && m.sides.every(s => s.entry !== null || isEmpty(matches, s)),
  )
  if (!bye) return [...matches]
  return decide(matches, bye, { outcome: 'bye', winner: bye.sides[0].entry === null ? 1 : 0 })
}

/**
 * Once every group match is decided, puts each group's places into the knockout, ranked by
 * {@link standings} with `averages` for the last tie-break; `groups` is {@link snakeGroups}' split.
 * Until then the knockout stays waiting, and a second call changes nothing.
 */
export function fillKnockout(
  matches: readonly Match[],
  groups: readonly (readonly string[])[],
  averages: ReadonlyMap<string, number> = new Map(),
): Match[] {
  const stage = matches.filter(m => m.bracket === 'group')
  if (stage.some(m => !m.result)) return [...matches]
  const tables = groups.map((entries, i) =>
    standings(
      stage.filter(m => m.group === i + 1),
      entries,
      averages,
    ),
  )
  const fill = (s: Side): Side =>
    s.source?.from === 'group' && s.entry === null ? { ...s, entry: tables[s.source.group - 1][s.source.place - 1].entry } : s
  return settle(matches.map(m => (m.result ? m : { ...m, sides: [fill(m.sides[0]), fill(m.sides[1])] as const })))
}

/** Records a match's result and moves its entries on: the winner, and in a double elimination the loser. */
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
