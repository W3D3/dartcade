// A running tournament's bracket as a fold: the draw is made again from the entries' seeds, then
// every decided match is applied in the order it finished. So the stored rows never hold where a
// side comes from: the draw does, and a restart rebuilds the same bracket. Pure, no DB or IO.
import {
  advance,
  doubleElimination,
  fillKnockout,
  groupsKnockout,
  roundRobin,
  singleElimination,
  snakeGroups,
  standings,
  type Bracket,
  type GroupStage,
  type Match,
  type MatchResult,
} from './bracket.js'
import type { TournamentFormat, TournamentSettings } from './setup.js'

export interface DrawSetup {
  readonly format: TournamentFormat
  readonly settings: Pick<TournamentSettings, 'firstTo' | 'longerFinal' | 'groups'>
}

/** Where a match sits in the bracket: the stored row's key. */
export interface MatchPlace {
  readonly bracket: Bracket
  readonly group: number | null
  readonly round: number
  readonly index: number
}

/** A match decided by playing (or a walkover, or the organizer), as stored. */
export type Decided = MatchPlace & { readonly result: MatchResult }

export const samePlace = (a: MatchPlace, b: MatchPlace): boolean =>
  a.bracket === b.bracket && a.group === b.group && a.round === b.round && a.index === b.index

const isGroupStage = (g: { size: number; through: number }): g is GroupStage => [3, 4, 5].includes(g.size) && [1, 2].includes(g.through)

function groupStage(s: DrawSetup): GroupStage {
  const g = s.settings.groups
  if (!g || !isGroupStage(g)) throw new Error('groups + knockout needs groups of 3-5 with 1 or 2 going through')
  return g
}

/** The draw for entries in seed order (seed 1 first); throws when the field is too small for the format. */
export function drawFor(setup: DrawSetup, seeded: readonly string[]): Match[] {
  const length = { firstTo: setup.settings.firstTo, ...(setup.settings.longerFinal && { final: setup.settings.longerFinal }) }
  switch (setup.format) {
    case 'single_elimination':
      return singleElimination(seeded, length)
    case 'double_elimination':
      return doubleElimination(seeded, length)
    case 'round_robin':
      return roundRobin(seeded, setup.settings.firstTo)
    case 'groups_knockout':
      return groupsKnockout(seeded, groupStage(setup), length)
  }
}

/** The bracket after `decided` (in the order they finished): who plays where, and what is still open. */
export function replay(setup: DrawSetup, seeded: readonly string[], decided: readonly Decided[]): Match[] {
  const groups = setup.format === 'groups_knockout' ? snakeGroups(seeded, groupStage(setup).size) : null
  let matches = drawFor(setup, seeded)
  for (const d of decided) {
    const m = matches.find(x => samePlace(x, d))
    if (!m) throw new Error(`no match ${d.bracket} ${d.group ?? ''} R${d.round}M${d.index} in the draw`)
    matches = advance(matches, m.key, d.result)
    if (groups) matches = fillKnockout(matches, groups)
  }
  return matches
}

export const isComplete = (matches: readonly Match[]): boolean => matches.every(m => m.result !== null)

/** How far an entry got: the deepest stage it played in, then (for a group stage) its group place. */
type Depth = readonly [stage: number, groupPlace: number]

const CHAMPION = Number.MAX_SAFE_INTEGER
// Grand finals come after every lower round
const FINAL_STAGE = 1_000

function stageOf(m: Match): number {
  switch (m.bracket) {
    case 'group':
      return 0
    case 'final':
      return FINAL_STAGE + m.round
    default:
      return m.round
  }
}

/** The match that decides the title: the grand final played last, or the knockout's final. */
function titleMatch(matches: readonly Match[]): Match | undefined {
  const finals = matches.filter(m => m.bracket === 'final')
  if (finals.length > 0) return finals.reduce((a, b) => (b.round > a.round ? b : a))
  const main = matches.filter(m => m.bracket === 'main')
  return main.reduce<Match | undefined>((a, b) => (a === undefined || b.round > a.round ? b : a), undefined)
}

/**
 * Each entry's final place in a finished bracket; entries knocked out at the same stage share it
 * (both losing semi-finalists are 3rd). A round robin's places are its table.
 */
export function finalPlaces(setup: DrawSetup, seeded: readonly string[], matches: readonly Match[]): Map<string, number> {
  if (setup.format === 'round_robin') return new Map(standings(matches, seeded).map((s, i) => [s.entry, i + 1]))
  const depth = new Map<string, Depth>(seeded.map(e => [e, [-1, 0]]))
  if (setup.format === 'groups_knockout') {
    const groups = snakeGroups(seeded, groupStage(setup).size)
    groups.forEach((entries, i) =>
      standings(
        matches.filter(m => m.group === i + 1),
        entries,
      ).forEach((s, place) => depth.set(s.entry, [0, -place])),
    )
  }
  for (const m of matches) {
    for (const side of m.sides) {
      const was = depth.get(side.entry ?? '')
      // Past the groups, the group place no longer separates anyone
      if (side.entry !== null && was && stageOf(m) > was[0]) depth.set(side.entry, [stageOf(m), stageOf(m) === 0 ? was[1] : 0])
    }
  }
  const title = titleMatch(matches)
  const champion = title?.result ? title.sides[title.result.winner].entry : null
  if (champion !== null) depth.set(champion, [CHAMPION, 0])
  const deeper = (a: Depth, b: Depth) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])
  const all = [...depth.values()]
  return new Map([...depth].map(([e, d]) => [e, 1 + all.filter(o => deeper(o, d)).length]))
}
