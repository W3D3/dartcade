// Room types on the map and the encounters a fight room draws from, by floor.
import type { EnemyId } from './enemies.js'

/** `shop` exists in the spec but has no screen yet: the map generator's weight for it is 0. */
export type RoomType = 'fight' | 'elite' | 'boss' | 'treasure' | 'rest' | 'event' | 'shop'

export const ROOM_TYPES: readonly RoomType[] = ['fight', 'elite', 'boss', 'treasure', 'rest', 'event', 'shop']

export type BattleRoom = Extract<RoomType, 'fight' | 'elite' | 'boss'>
export const isBattleRoom = (t: RoomType): t is BattleRoom => t === 'fight' || t === 'elite' || t === 'boss'

/** An encounter: its enemies, front first. */
export type Encounter = readonly EnemyId[]

/** The encounters a room may draw, for floors from `from` up (the last match wins). */
export const ENCOUNTERS: Record<BattleRoom, { from: number; pool: Encounter[] }[]> = {
  fight: [
    { from: 1, pool: [['slime'], ['skeleton'], ['slime', 'slime']] },
    { from: 4, pool: [['skeleton', 'slime'], ['ghost'], ['ghost', 'slime']] },
  ],
  elite: [{ from: 1, pool: [['armoredKnight'], ['ghost', 'skeleton']] }],
  boss: [{ from: 1, pool: [['dungeonWarden']] }],
}

export function encounterPool(room: BattleRoom, floor: number): Encounter[] {
  return ENCOUNTERS[room].filter(b => floor >= b.from).at(-1)?.pool ?? ENCOUNTERS[room][0].pool
}
