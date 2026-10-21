// The built-in avatar picture (Settings → Profile): the Dartcade mark on a background colour,
// with its own foreground (icon) colour — chosen independently, from a short list of basic
// colours. There's only one icon for now; more (and more colours) unlock through XP progression
// later, so `preset` stays a real field rather than being dropped, even with one value in it.
export interface AvatarPreset {
  id: string
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [{ id: 'logo' }] as const

// A short list of basic colours a preset's background or foreground can be set to.
export const AVATAR_COLORS: readonly string[] = [
  '#808080', // grey
  '#000000', // black
  '#ffffff', // white
  '#c0392b', // red
  '#2d6cdf', // blue
  '#3a8f4a', // green
] as const

/** A new account's avatar, before they ever touch Settings → Profile. */
export const DEFAULT_AVATAR_PRESET = 'logo'
export const DEFAULT_AVATAR_BG = '#808080' // grey
export const DEFAULT_AVATAR_FG = '#000000' // black

const PRESET_IDS = new Set(AVATAR_PRESETS.map(p => p.id))
const PRESET_COLORS = new Set<string>(AVATAR_COLORS)

/** Whether `id` is one of the built-in preset icons. */
export const isAvatarPreset = (id: string): boolean => PRESET_IDS.has(id)

/** Whether `color` is one of the built-in swatches (used for both background and foreground). */
export const isAvatarColor = (color: string): boolean => PRESET_COLORS.has(color)
