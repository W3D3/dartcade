// Enemies with their base HP, attack pattern and defences (1 player, Medium; balance.ts scales them).
import type { Defences, EnemyEntry } from './types.js'

const none: Defences = { weak: [], resist: [], immune: [] }

export const ENEMIES = {
  slime: {
    name: 'Slime',
    rarity: 'common',
    hp: 60,
    pattern: [{ kind: 'attack', value: 6 }],
    defences: { weak: [{ number: 19 }], resist: [{ number: 5 }, { number: 20 }], immune: [] },
    note: 'Tutorial enemy.',
  },
  skeleton: {
    name: 'Skeleton',
    rarity: 'common',
    hp: 90,
    pattern: [{ kind: 'attack', value: 8 }],
    defences: { weak: [{ ring: 'double' }], resist: [], immune: [{ number: 7 }, { number: 3 }] },
    note: 'Teaches immunities.',
  },
  ghost: {
    name: 'Ghost',
    rarity: 'uncommon',
    hp: 100,
    pattern: [{ kind: 'attack', value: 8, pierce: true }],
    defences: { weak: [{ ring: 'double' }], resist: [{ ring: 'single' }, { ring: 'treble' }], immune: [] },
    note: 'Ignores your block. Doubles hunters.',
  },
  armoredKnight: {
    name: 'Armored Knight',
    rarity: 'uncommon',
    hp: 120,
    pattern: [{ kind: 'none' }, { kind: 'attack', value: 14 }],
    // shortcut: singles are resisted (half), not the catalogue's flat 1, until a damage cap effect exists
    defences: { weak: [{ ring: 'treble' }], resist: [{ ring: 'single' }], immune: [] },
    note: 'Only trebles do real damage. Armor tier.',
  },
  dungeonWarden: {
    name: 'Dungeon Warden',
    rarity: 'legendary',
    hp: 600,
    pattern: [{ kind: 'none' }, { kind: 'attack', value: 25 }],
    defences: { ...none, resist: [{ ring: 'single' }] },
    phases: [
      { below: 2 / 3, weak: [], resist: [{ ring: 'single' }], immune: [{ number: 1 }, { number: 5 }, { number: 20 }] },
      { below: 1 / 3, weak: [{ ring: 'bull' }], resist: [{ ring: 'single' }], immune: [] },
    ],
    note: 'Act 1 boss: armoured, then a bull-weak core.',
  },
} as const satisfies Record<string, EnemyEntry>

export type EnemyId = keyof typeof ENEMIES
export const isEnemyId = (id: string): id is EnemyId => Object.hasOwn(ENEMIES, id)
export const ENEMY_IDS: EnemyId[] = Object.keys(ENEMIES).filter(isEnemyId)

/** The defences an enemy has at this HP (a boss changes them by phase). */
export function defencesAt(id: EnemyId, hp: number, maxHp: number): Defences {
  const entry: EnemyEntry = ENEMIES[id]
  const phase = (entry.phases ?? []).filter(p => hp <= p.below * maxHp).at(-1)
  return phase ?? entry.defences
}
