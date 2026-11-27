// The act's map (spec: "The map"): a lattice of lanes, floor 1 at the bottom and the boss at the top,
// both in the middle lane. A room in lane c leads up to lane c - 1 (left) and c + 1 (right) on the floor
// above, so the only choice is left or right and no path goes down or sideways. Generated once from the
// run's generator; a replay draws the same map.
import type { Rng } from '../rng.js'
import { ROOM_TYPES, type RoomType } from './content/rooms.js'
import type { Side } from './hit.js'
import type { Rules } from './rules.js'

export type MapRoom = { lane: number; type: RoomType }

/** `floors[0]` is floor 1. */
export type DungeonMap = { lanes: number; floors: MapRoom[][] }

type Weighted = Exclude<RoomType, 'boss'>

function weightedPick(rng: Rng, weights: Partial<Record<Weighted, number>>): Weighted {
  const entries = ROOM_TYPES.filter((t): t is Weighted => t !== 'boss')
    .map(t => [t, weights[t] ?? 0] as const)
    .filter(([, w]) => w > 0)
  let r = rng() * entries.reduce((n, [, w]) => n + w, 0)
  for (const [t, w] of entries) if ((r -= w) < 0) return t
  return entries[entries.length - 1][0]
}

/** The lanes of a floor: every lane a room below leads to (floor 1: the middle lane). */
function lanesOf(floor: number, lanes: number): number[] {
  const middle = Math.floor(lanes / 2)
  return Array.from({ length: lanes }, (_, lane) => lane).filter(
    lane => Math.abs(lane - middle) % 2 === (floor - 1) % 2 && Math.abs(lane - middle) < floor,
  )
}

/** The rooms on the floor above a room (or above the start, floor 0), by the side they lie on. */
export function roomsAbove(map: DungeonMap, floor: number, lane: number | null): Partial<Record<Side, MapRoom>> {
  const above = map.floors.at(floor) ?? []
  if (lane === null) return above.length === 1 ? { left: above[0] } : {}
  const at = (l: number) => above.find(r => r.lane === l)
  return { ...(at(lane - 1) && { left: at(lane - 1) }), ...(at(lane + 1) && { right: at(lane + 1) }) }
}

/**
 * Floor 1 is a fight, the floor before the boss has a rest, and no elite or shop leads to another
 * (an elite never stands right above an elite it can be reached from).
 */
export function generateMap(floors: number, rng: Rng, rules: Rules): DungeonMap {
  const lanes = rules.map.lanes
  const out: MapRoom[][] = []
  for (let f = 1; f < floors; f++) {
    const below = out.at(-1) ?? []
    const row = lanesOf(f, lanes).map((lane): MapRoom => {
      if (f === 1) return { lane, type: 'fight' }
      const parents = below.filter(r => Math.abs(r.lane - lane) === 1).map(r => r.type)
      const weights: Partial<Record<Weighted, number>> = { ...rules.map.weights }
      if (f < rules.map.eliteFrom || parents.includes('elite')) weights.elite = 0
      if (parents.includes('shop')) weights.shop = 0
      return { lane, type: weightedPick(rng, weights) }
    })
    if (f === floors - 1 && !row.some(r => r.type === 'rest')) row[Math.floor(rng() * row.length)].type = 'rest'
    out.push(row)
  }
  out.push([{ lane: Math.floor(lanes / 2), type: 'boss' }])
  return { lanes, floors: out }
}

/** A vote's result: the choice with most votes, a tie drawn from the generator. `votes` is not empty. */
export function tally<T>(votes: readonly T[], rng: Rng): T {
  const counts = new Map<T, number>()
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1)
  const most = Math.max(...counts.values())
  const top = [...counts].filter(([, n]) => n === most).map(([v]) => v)
  return top[Math.floor(rng() * top.length)]
}
