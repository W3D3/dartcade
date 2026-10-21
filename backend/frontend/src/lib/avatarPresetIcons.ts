// Which icon each built-in avatar preset (shared/avatarPresets.ts) shows, styled like the
// existing bot glyph: a single-colour icon centered on the preset's coloured circle. Just the
// Dartcade mark for now — XP progression unlocks more icons later, so this stays a lookup (one
// entry) rather than being collapsed into a single hardcoded component.
import DartcadeMark from '$lib/components/DartcadeMark.svelte'
import type { Component } from 'svelte'

export const AVATAR_PRESET_ICONS: Record<string, Component> = {
  logo: DartcadeMark,
}
