// The run's settings and tuning in one place. `DungeonConfig` is what the lobby picks (checked by the
// module's configMeta); `DUNGEON_RULES` holds every other number a run plays by, so a variant is a
// new config field read in rulesOf, not a constant hunted down in the engine.
import type { RoomType } from './content/rooms.js'

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' }

/** Floors in the act; the last one is the boss. */
export const FLOOR_COUNTS = [5, 7, 9] as const

export type DungeonConfig = { difficulty: Difficulty; floors: (typeof FLOOR_COUNTS)[number] }

export const DEFAULT_CONFIG: DungeonConfig = { difficulty: 'medium', floors: 9 }

/** Enemy HP and damage multipliers per difficulty (on top of the party-size scaling). */
export const DIFFICULTY_SCALE: Record<Difficulty, { hp: number; damage: number }> = {
  easy: { hp: 0.7, damage: 0.7 },
  medium: { hp: 1, damage: 1 },
  hard: { hp: 1.4, damage: 1.3 },
  expert: { hp: 1.8, damage: 1.6 },
}

export const DUNGEON_RULES = {
  minParty: 1,
  maxParty: 4,
  startHp: 80,
  /** Fixed by the engine's visit (session/apply.ts); the rules read it, never change it. */
  dartsPerVisit: 3,
  /** Segment items one number holds. */
  slotsPerNumber: 1,
  /** Artifacts a treasure offers each hero. */
  offerSize: 3,
  /** How much Chill cuts an enemy's attack. */
  chill: 0.25,
  /** The map generator: lanes across, the weights of the room types on a regular floor. */
  map: {
    lanes: 5,
    weights: { fight: 6, elite: 2, treasure: 2, rest: 2, event: 2, shop: 0 } satisfies Record<Exclude<RoomType, 'boss'>, number>,
    /** The first floor an elite may stand on. */
    eliteFrom: 3,
  },
  /** Gold for a won fight: base plus per floor. */
  gold: { fight: { base: 10, perFloor: 2 }, elite: { base: 25, perFloor: 3 }, boss: { base: 0, perFloor: 0 } },
} as const

export type Rules = typeof DUNGEON_RULES

/** The rules a run with this config plays by. */
export const rulesOf = (_cfg: DungeonConfig): Rules => DUNGEON_RULES

/** Enemy HP for the party: base x 0.8 x players (never below base) x the difficulty. */
export const enemyHp = (base: number, players: number, difficulty: Difficulty): number =>
  Math.round(base * Math.max(1, 0.8 * players) * DIFFICULTY_SCALE[difficulty].hp)

/** An attack's damage on this difficulty, after Chill. */
export const attackDamage = (base: number, difficulty: Difficulty, chilled: boolean, rules: Rules): number =>
  Math.round(base * DIFFICULTY_SCALE[difficulty].damage * (chilled ? 1 - rules.chill : 1))
