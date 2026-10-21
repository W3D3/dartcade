// Which icon each built-in avatar preset (shared/avatarPresets.ts) shows, styled like the
// existing bot glyph: a single-colour icon centered on the preset's coloured circle. Everyone has
// the Dartcade mark; the rest are progression rewards (`picture.<id>`, shared/progression.ts).
import { Crown, Flame, Shield, Star, Target } from '@lucide/svelte'
import DartcadeMark from '$lib/components/DartcadeMark.svelte'
import DartIcon from '$lib/components/avatar/DartIcon.svelte'
import type { Component } from 'svelte'

export const AVATAR_PRESET_ICONS: Record<string, Component<{ size?: number | string }>> = {
  logo: DartcadeMark,
  dart: DartIcon,
  target: Target,
  star: Star,
  crown: Crown,
  flame: Flame,
  shield: Shield,
}
