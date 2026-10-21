// Profile pictures as rewards: the avatar presets (shared/avatarPresets.ts), each unlocked by a
// `picture.<id>` perk. Settings and your profile's
// Customise both wear one through PATCH /api/me, keeping the colours you chose.
import { get } from 'svelte/store'
import { api } from '$lib/api/client'
import { currentUser } from '$lib/auth'
import { refreshProfile } from './profiles'
import { reloadProgress } from './store'
import { DEFAULT_AVATAR_BG, DEFAULT_AVATAR_FG } from '$shared/avatarPresets.js'
import { PERKS, unlockText, type Perk } from '$shared/progression.js'
import type { components } from '$lib/api/schema'

type Avatar = components['schemas']['Avatar']
export type PresetAvatar = Extract<Avatar, { kind: 'preset' }>

/** Avatar preset `preset` in the colours of `current` (the defaults when it has none). */
export function presetIn(current: Avatar | null | undefined, preset: string): PresetAvatar {
  const colors = current?.kind === 'preset' ? current : { color: DEFAULT_AVATAR_BG, fgColor: DEFAULT_AVATAR_FG }
  return { kind: 'preset', preset, color: colors.color, fgColor: colors.fgColor }
}

/** The perk behind a preset, and what unlocks it ('Level 20', '7-day streak'). */
export const picturePerk = (preset: string): Perk | undefined => PERKS.find(p => p.id === `picture.${preset}`)
export const pictureUnlock = (preset: string): string => {
  const p = picturePerk(preset)
  return p ? unlockText(p.unlock) : ''
}

/** Wears preset `preset`; resolves with an error message, or null when done. */
export async function wearPicture(preset: string): Promise<string | null> {
  const me = get(currentUser)
  const { error } = await api.PATCH('/api/me', { body: { avatar: presetIn(me?.avatar, preset) } })
  if (error) return error.error
  await currentUser.refresh()
  reloadProgress()
  if (me) refreshProfile(me.id)
  return null
}
