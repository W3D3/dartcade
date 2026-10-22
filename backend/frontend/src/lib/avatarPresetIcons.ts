// The art of each built-in avatar preset (shared/avatarPresets.ts): a single-colour icon centred on
// the preset's coloured circle, styled like the bot glyph. Everyone has the Dartcade mark; the rest
// are progression rewards (`picture.<id>`, shared/progression.ts). Most are placeholders: swap an
// entry's `icon` for the finished art. `color` overrides the wearer's icon colour (a golden dart is
// gold whatever they picked); `motion` animates the icon (cosmetic motion classes in app.css).
import { Feather, Flame, Shield, Swords, Target, Trophy } from '@lucide/svelte'
import DartcadeMark from '$lib/components/DartcadeMark.svelte'
import DartIcon from '$lib/components/avatar/DartIcon.svelte'
import type { Component } from 'svelte'

export type PresetArt = { icon: Component<{ size?: number | string }>; color?: string; motion?: 'flicker' }

export const AVATAR_PRESET_ART: Record<string, PresetArt> = {
  logo: { icon: DartcadeMark },
  dart: { icon: DartIcon },
  flight: { icon: Feather },
  board: { icon: Target },
  trophy: { icon: Trophy },
  'crossed-darts': { icon: Swords },
  'burning-dart': { icon: DartIcon, color: '#ff8a3a', motion: 'flicker' },
  'golden-dart': { icon: DartIcon, color: '#f2c14e' },
  flame: { icon: Flame },
  shield: { icon: Shield },
}
