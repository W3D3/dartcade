// Profile pictures as rewards: the avatar finishes (shared/avatarFinishes.ts), each unlocked by a
// `picture.<id>` perk and worn on either layer, foreground or background. Your profile's
// Customise wears one through PATCH /api/me.
import { get } from 'svelte/store'
import { api } from '$lib/api/client'
import { currentUser } from '$lib/auth'
import { refreshProfile } from './profiles'
import { reloadProgress } from './store'
import { AVATAR_FINISHES, type AvatarFinish } from '$shared/avatarFinishes.js'
import { PERKS, listed, pictureFor, unlockText, type Perk } from '$shared/progression.js'
import type { components } from '$lib/api/schema'

type Avatar = components['schemas']['Avatar']
export type PresetAvatar = Extract<Avatar, { kind: 'preset' }>

/** Finish `finish` on both layers: how a picture reward is shown, and worn when applied as a whole. */
export const finishAvatar = (finish: string): PresetAvatar => ({ kind: 'preset', foreground: finish, background: finish })

/** The perk behind a finish, and what unlocks it ('Level 20', '7-day streak', a challenge's text). */
export const picturePerk = (finish: string): Perk | undefined => PERKS.find(p => p.id === `picture.${finish}`)
export const pictureUnlock = (finish: string): string => {
  const p = picturePerk(finish)
  return p ? unlockText(p.unlock) : ''
}

/** The finishes a player sees: the ones they can earn, and any they hold or wear (`held`: finish ids). */
export const shownFinishes = (held: readonly string[]): AvatarFinish[] =>
  AVATAR_FINISHES.filter(f => {
    const p = picturePerk(f.id)
    return !p || listed(p, held.map(pictureFor))
  })

/** Wears `foreground` on `background`; resolves with an error message, or null when done. */
export async function wearPicture(foreground: string, background: string): Promise<string | null> {
  const me = get(currentUser)
  const { error } = await api.PATCH('/api/me', { body: { avatar: { kind: 'preset', foreground, background } } })
  if (error) return error.error
  await currentUser.refresh()
  reloadProgress()
  if (me) refreshProfile(me.id)
  return null
}
