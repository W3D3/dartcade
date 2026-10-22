// The built-in avatar pictures (Settings → Profile, and Customise on your profile): an icon on a
// background colour, with its own foreground (icon) colour, chosen independently from a short list
// of basic colours. The Dartcade mark is everyone's; the others unlock through progression
// (`picture.<id>` in shared/progression.ts PERKS: levels, a streak milestone, deeds).
export interface AvatarPreset {
  id: string
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: 'logo' },
  { id: 'dart' },
  { id: 'flight' },
  { id: 'board' },
  { id: 'trophy' },
  { id: 'crossed-darts' },
  { id: 'burning-dart' },
  { id: 'golden-dart' },
  { id: 'flame' },
  { id: 'shield' },
] as const

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
