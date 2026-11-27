// Artifacts, owned per hero (docs/superpowers/specs/2026-11-27-dungeon-content.md). Add one with an
// entry here and a sprite in the SPA's sprite table: see docs/adding-a-dungeon-artifact.md.
import type { ContentEntry } from './types.js'

const sameNumber = (a: { number: number; ring: string }, b: { number: number; ring: string }) => a.ring !== 'miss' && a.number === b.number

export const ARTIFACTS = {
  pinCushion: {
    name: 'Pin Cushion',
    rarity: 'common',
    status: 'accepted',
    description: 'Each dart on the same segment as your previous dart deals +10 damage.',
    trigger: 'On each dart',
    hooks: {
      onDart: ({ hit, previous }) => (previous && sameNumber(hit, previous) ? [{ effect: 'base_add', value: 10 }] : []),
    },
  },
  twinBuckler: {
    name: 'Twin Buckler',
    rarity: 'common',
    status: 'draft',
    description: 'Every double you hit also gives you 8 block.',
    trigger: 'On a double',
    hooks: { onDart: ({ hit }) => (hit.ring === 'double' ? [{ effect: 'block', value: 8 }] : []) },
  },
  piercingSword: {
    name: 'Piercing Sword',
    rarity: 'uncommon',
    status: 'accepted',
    description: 'Double damage when all three darts hit the same segment.',
    trigger: 'On each dart',
    hooks: {
      onDart: ({ visit }) => (visit.length === 3 && visit.every(h => sameNumber(h, visit[0])) ? [{ effect: 'mult_mul', value: 2 }] : []),
    },
  },
  tinderbox: {
    name: 'Tinderbox',
    rarity: 'uncommon',
    status: 'accepted',
    description: 'Trebles apply Burn: 10 damage at the end of each round, stacking.',
    trigger: 'On a treble',
    hooks: { onDart: ({ hit }) => (hit.ring === 'treble' ? [{ effect: 'burn', value: 10 }] : []) },
  },
  spikedBuckler: {
    name: 'Spiked Buckler',
    rarity: 'rare',
    status: 'accepted',
    description: 'Your last dart each visit deals bonus damage equal to your current block.',
    trigger: 'After your visit',
    hooks: { afterVisit: ({ hero }) => (hero.block > 0 ? [{ effect: 'damage', value: hero.block }] : []) },
  },
} as const satisfies Record<string, ContentEntry>

export type ArtifactId = keyof typeof ARTIFACTS
export const isArtifactId = (id: string): id is ArtifactId => Object.hasOwn(ARTIFACTS, id)
export const ARTIFACT_IDS: ArtifactId[] = Object.keys(ARTIFACTS).filter(isArtifactId)
