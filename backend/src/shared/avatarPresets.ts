// The built-in avatar picture choices (Settings → Profile), styled like the existing bot glyph:
// a single-colour icon on a coloured circle, not a photo. Backend validates a chosen id against
// this list; the frontend maps each id to a Lucide icon (lib/avatarPresetIcons.ts — Svelte
// components can't live in shared code) and renders it on `color`.
export interface AvatarPreset {
  id: string
  /** The chip's background colour (hex), picked from the same muted palette as avatarColor.ts. */
  color: string
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: 'rabbit', color: '#73503d' },
  { id: 'cat', color: '#5e3d73' },
  { id: 'dog', color: '#4a6b3a' },
  { id: 'bird', color: '#3d7373' },
  { id: 'fish', color: '#3d5a73' },
  { id: 'ghost', color: '#6b6b3a' },
  { id: 'rocket', color: '#3d4a73' },
  { id: 'crown', color: '#733d55' },
] as const

const PRESET_IDS = new Set(AVATAR_PRESETS.map(p => p.id))

/** Whether `id` is one of the built-in presets. */
export const isAvatarPreset = (id: string): boolean => PRESET_IDS.has(id)
