// The act's map (spec: "The map"): floor 1 at the bottom, the boss alone on the last floor, at most a
// left and a right room per floor, and every room leads up to both rooms of the floor above, so the
// only choice is left or right. Generated once from the run's generator; a replay draws the same map.
import type { Rng } from '../rng.js'
import { ROOM_TYPES, type RoomType } from './content/rooms.js'
import type { Side } from './hit.js'
import type { Rules } from './rules.js'

export type MapRoom = { side: Side; type: RoomType }

/** `floors[0]` is floor 1. */
export type DungeonMap = { floors: MapRoom[][] }

type Weighted = Exclude<RoomType, 'boss'>

function weightedPick(rng: Rng, weights: Partial<Record<Weighted, number>>): Weighted {
  const entries = ROOM_TYPES.filter((t): t is Weighted => t !== 'boss')
    .map(t => [t, weights[t] ?? 0] as const)
    .filter(([, w]) => w > 0)
  let r = rng() * entries.reduce((n, [, w]) => n + w, 0)
  for (const [t, w] of entries) if ((r -= w) < 0) return t
  return entries[entries.length - 1][0]
}

/**
 * Floor 1 is fights, the floor before the boss offers a rest, and no two elites or shops stand on
 * consecutive floors (every room links to both above, so that would put two in a row).
 */
export function generateMap(floors: number, rng: Rng, rules: Rules): DungeonMap {
  const out: MapRoom[][] = []
  for (let f = 1; f < floors; f++) {
    const below = new Set(out.at(-1)?.map(r => r.type) ?? [])
    const weights: Partial<Record<Weighted, number>> = { ...rules.map.weights }
    if (f < rules.map.eliteFrom || below.has('elite')) weights.elite = 0
    if (below.has('shop')) weights.shop = 0
    const room = (side: Side): MapRoom => ({ side, type: f === 1 ? 'fight' : weightedPick(rng, weights) })
    const pair = [room('left'), room('right')]
    if (f === floors - 1 && !pair.some(r => r.type === 'rest')) pair[Math.floor(rng() * 2)].type = 'rest'
    // Two equal rooms other than fights would be no choice: the right one becomes a fight
    if (pair[0].type === pair[1].type && pair[0].type !== 'fight') pair[1].type = 'fight'
    out.push(pair)
  }
  out.push([{ side: 'left', type: 'boss' }])
  return { floors: out }
}

/** A vote's result: the choice with most votes, a tie drawn from the generator. `votes` is not empty. */
export function tally<T>(votes: readonly T[], rng: Rng): T {
  const counts = new Map<T, number>()
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1)
  const most = Math.max(...counts.values())
  const top = [...counts].filter(([, n]) => n === most).map(([v]) => v)
  return top[Math.floor(rng() * top.length)]
}
