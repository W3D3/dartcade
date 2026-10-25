// The built-in profile pictures: the Dartcade ring and bull in one of thirty finishes, drawn in two
// layers, a background disc and the mark in front (the art is
// frontend/src/lib/assets/finishes/<id>/{background,foreground}.svg). Each layer is picked
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
  { id: 'origami', name: 'Origami' },
  { id: 'bronze', name: 'Bronze' },
  { id: 'patch', name: 'Patch' },
  { id: 'blueprint', name: 'Blueprint' },
  { id: 'peppermint', name: 'Peppermint' },
  { id: 'graffiti', name: 'Graffiti' },
  { id: 'chrome', name: 'Chrome' },
  { id: 'topo', name: 'Topo' },
  { id: 'circuit', name: 'Circuit' },
  { id: 'neon', name: 'Neon' },
  { id: 'koi', name: 'Koi pond' },
  { id: 'stained-glass', name: 'Stained glass' },
  { id: 'inferno', name: 'Inferno' },
  { id: 'synthwave', name: 'Synthwave' },
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
