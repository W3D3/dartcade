// What the playground can pick from. Every list is read from the engine's registries when asked, so
// content added there (docs/adding-a-dungeon-artifact.md) shows up with no change here.
import { ARTIFACTS } from '$shared/dungeon/content/artifacts.js'
import { CLASSES } from '$shared/dungeon/content/classes.js'
import { ENEMIES } from '$shared/dungeon/content/enemies.js'
import { SEGMENT_ITEMS } from '$shared/dungeon/content/segmentItems.js'
import type { ContentEntry, EnemyEntry, Rarity } from '$shared/dungeon/content/types.js'

/** A registry looked up by an id from outside (a file, a select): a miss is undefined, not a crash. */
export type Registry<T> = Readonly<Partial<Record<string, T>>>

export type Catalogue = {
  artifacts: Registry<ContentEntry>
  items: Registry<ContentEntry>
  classes: Registry<ContentEntry & { startingArtifact: string }>
  enemies: Registry<EnemyEntry>
}

/** The registries as they are now (a getter, not a snapshot, so a registered entry is seen at once). */
export const liveCatalogue = (): Catalogue => ({ artifacts: ARTIFACTS, items: SEGMENT_ITEMS, classes: CLASSES, enemies: ENEMIES })

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

export type Pickable = { id: string; name: string; rarity: Rarity; description: string; trigger: string; status: string }

/** One registry as picker rows: rarest last, then by name. */
export function pickables(registry: Registry<ContentEntry>): Pickable[] {
  return Object.entries(registry)
    .flatMap(([id, e]) => (e ? [{ id, e }] : []))
    .map(({ id, e }) => ({ id, name: e.name, rarity: e.rarity, description: e.description, trigger: e.trigger, status: e.status }))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name))
}

export const knows = (registry: Registry<unknown>, id: string): boolean => Object.hasOwn(registry, id)
