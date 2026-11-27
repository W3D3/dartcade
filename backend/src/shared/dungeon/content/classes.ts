// Classes: one per hero, picked when the run starts; no two heroes share one. Each starts the run
// with one artifact (Dungeon-Pixel-Party).
import type { ArtifactId } from './artifacts.js'
import type { ContentEntry, Modifiers } from './types.js'

export type ClassEntry = ContentEntry & { startingArtifact: ArtifactId }

export const CLASSES = {
  archer: {
    name: 'Archer',
    rarity: 'epic',
    status: 'accepted',
    description: 'Doubles deal x4 damage. Treble damage -25%.',
    trigger: 'On each dart',
    hooks: {
      onDart: ({ hit }) =>
        hit.ring === 'double' ? [{ effect: 'mult_mul', value: 4 }] : hit.ring === 'treble' ? [{ effect: 'mult_mul', value: 0.75 }] : [],
    },
    startingArtifact: 'tinderbox',
  },
  brawler: {
    name: 'Brawler',
    rarity: 'uncommon',
    status: 'accepted',
    description: 'Singles deal x1.5 damage; +20% max HP.',
    trigger: 'On each dart',
    hooks: { onDart: ({ hit }) => (hit.ring === 'single' ? [{ effect: 'mult_mul', value: 1.5 }] : []) },
    modifiers: { maxHp: 1.2 },
    startingArtifact: 'pinCushion',
  },
  mage: {
    name: 'Mage',
    rarity: 'rare',
    status: 'accepted',
    description: 'Trebles chain: also deal 50% to a second enemy.',
    trigger: 'On a treble',
    hooks: {
      afterDart: ({ hit, damage }) =>
        hit.ring === 'treble' && damage > 0 ? [{ effect: 'damage', value: Math.floor(damage / 2), second: true }] : [],
    },
    startingArtifact: 'piercingSword',
  },
  guardian: {
    name: 'Guardian',
    rarity: 'rare',
    status: 'accepted',
    // shortcut: the second half ("hitting an ally's number gives them block") is left out until an ally's number is defined
    description: 'Keep 50% of unused block each round.',
    trigger: 'After your visit',
    hooks: {},
    modifiers: { blockCarry: 0.5 },
    startingArtifact: 'spikedBuckler',
  },
  healer: {
    name: 'Healer',
    rarity: 'rare',
    status: 'accepted',
    description: 'Pick a segment at run start: hitting it heals the party for 10.',
    trigger: 'On each dart',
    hooks: {
      onDart: ({ hit, hero }) =>
        hit.ring !== 'miss' && hit.number === hero.healSegment ? [{ effect: 'heal', value: 10, party: true }] : [],
    },
    startingArtifact: 'twinBuckler',
  },
} as const satisfies Record<string, ClassEntry>

export type ClassId = keyof typeof CLASSES
export const isClassId = (id: string): id is ClassId => Object.hasOwn(CLASSES, id)
export const CLASS_IDS: ClassId[] = Object.keys(CLASSES).filter(isClassId)

/** A class's lasting changes (max HP, block kept); none for a hero without one. */
const ENTRIES: Record<ClassId, ClassEntry> = CLASSES
export const modifiersOf = (id: ClassId | null): Modifiers => (id ? (ENTRIES[id].modifiers ?? {}) : {})
