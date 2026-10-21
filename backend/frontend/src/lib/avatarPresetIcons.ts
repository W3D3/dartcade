// Which Lucide icon each built-in avatar preset (shared/avatarPresets.ts) shows, styled like the
// existing bot glyph: a single-colour icon centered on the preset's coloured circle.
import { Bird, Cat, Crown, Dog, Fish, Ghost, Rabbit, Rocket } from '@lucide/svelte'
import type { Component } from 'svelte'

export const AVATAR_PRESET_ICONS: Record<string, Component> = {
  rabbit: Rabbit,
  cat: Cat,
  dog: Dog,
  bird: Bird,
  fish: Fish,
  ghost: Ghost,
  rocket: Rocket,
  crown: Crown,
}
