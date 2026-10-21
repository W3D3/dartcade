// Which Lucide icon each built-in avatar preset (shared/avatarPresets.ts) shows, styled like the
// existing bot glyph: a single-colour icon centered on the preset's coloured circle. Mostly darts
// themed (aiming, a bullseye, a hot streak, a pub pint), plus a couple of just-for-fun ones.
import { Beer, Cat, CircleDot, Crosshair, Flame, Ghost, Medal, Zap } from '@lucide/svelte'
import type { Component } from 'svelte'

export const AVATAR_PRESET_ICONS: Record<string, Component> = {
  crosshair: Crosshair,
  'circle-dot': CircleDot,
  flame: Flame,
  zap: Zap,
  medal: Medal,
  beer: Beer,
  cat: Cat,
  ghost: Ghost,
}
