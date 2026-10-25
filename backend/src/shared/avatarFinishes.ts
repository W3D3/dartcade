// The built-in profile pictures: the Dartcade ring and bull in one of twenty finishes, drawn in two
// layers, a background disc and the mark in front (the art is the sprite in
// frontend/src/lib/assets/finishes.svg, `finish-bg-<id>` and `finish-fg-<id>`). Each layer is picked
// on its own. Classic is everyone's; the others unlock through progression (`picture.<id>` in
// shared/progression.ts PERKS).
export interface AvatarFinish {
  id: string
  name: string
}

export const AVATAR_FINISHES: readonly AvatarFinish[] = [
  { id: 'classic', name: 'Classic' },
  { id: 'chalk', name: 'Chalk' },
  { id: 'arcade', name: 'Arcade' },
  { id: 'bronze', name: 'Bronze' },
  { id: 'chrome', name: 'Chrome' },
  { id: 'neon', name: 'Neon' },
  { id: 'inferno', name: 'Inferno' },
  { id: 'gold', name: 'Gold' },
  { id: 'hot-streak', name: 'Hot streak' },
  { id: 'crystal', name: 'Crystal' },
  { id: 'frost', name: 'Frost' },
  { id: 'carbon', name: 'Carbon' },
  { id: 'holo', name: 'Holo' },
  { id: 'marble', name: 'Marble' },
  { id: 'lava', name: 'Lava' },
  { id: 'electric', name: 'Electric' },
  { id: 'galaxy', name: 'Galaxy' },
  { id: 'toxic', name: 'Toxic' },
  { id: 'walnut', name: 'Walnut' },
  { id: 'glitch', name: 'Glitch' },
] as const

/** A new account's picture, on both layers, before they ever pick one. */
export const DEFAULT_AVATAR_FINISH = 'classic'

const FINISH_IDS = new Set(AVATAR_FINISHES.map(f => f.id))

/** Whether `id` is one of the built-in finishes. */
export const isAvatarFinish = (id: string): boolean => FINISH_IDS.has(id)
