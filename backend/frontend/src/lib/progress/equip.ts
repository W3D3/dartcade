import { api } from '$lib/api/client'
import { currentUser } from '$lib/auth'
import { get } from 'svelte/store'
import { reloadProgress } from './store'
import { refreshProfile } from './profiles'
import type { components } from '$lib/api/schema'

/** Wears unlocked perks (only the kinds given change); resolves with an error message, or null. */
export async function equip(changes: components['schemas']['EquipRequest']): Promise<string | null> {
  const { data } = await api.PUT('/api/progress/equip', { body: changes })
  if (!data) return "Couldn't change your card. Try again."
  reloadProgress()
  const me = get(currentUser)?.id
  if (me) refreshProfile(me)
  return null
}
