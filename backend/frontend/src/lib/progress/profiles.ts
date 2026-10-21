// Player profiles (GET /api/users/{id}/profile), fetched once per player while the app runs: the
// popup, your card and the profile page share them. Your own is read again whenever you
// earn XP or change your look.
import { derived, writable, type Readable } from 'svelte/store'
import { api } from '$lib/api/client'
import { me } from '$lib/lobby/sockets'
import { currentUser } from '$lib/auth'
import type { components } from '$lib/api/schema'
import type { DotKind } from '$lib/friends/view'

export type PlayerProfile = components['schemas']['PlayerProfile']

const cache = new Map<string, ReturnType<typeof writable<PlayerProfile | null>>>()

async function load(userId: string): Promise<void> {
  const { data } = await api.GET('/api/users/{id}/profile', { params: { path: { id: userId } } })
  if (data) cache.get(userId)?.set(data)
}

/**
 * A player's profile; null until it has loaded (or for good while progression is off). Fetched
 * on first use: a page that only shows it behind the progression flag never asks for it otherwise.
 */
export function profileOf(userId: string): Readable<PlayerProfile | null> {
  let store = cache.get(userId)
  if (!store) {
    let asked = false
    store = writable<PlayerProfile | null>(null, () => {
      if (asked) return
      asked = true
      void load(userId)
    })
    cache.set(userId, store)
  }
  return store
}

/** Reads a profile again (after you change your look, or earn XP). */
export function refreshProfile(userId: string): void {
  if (cache.has(userId)) void load(userId)
}

// Your own moves with every game you finish
let currentUserId: string | null = null
let currentAvatar = ''
currentUser.subscribe(u => {
  currentUserId = u?.id ?? null
  const avatar = JSON.stringify(u?.avatar ?? null)
  if (u && currentAvatar && avatar !== currentAvatar) refreshProfile(u.id)
  currentAvatar = avatar
})
me.xp.subscribe(m => {
  if (m && currentUserId) refreshProfile(currentUserId)
})

/**
 * The ring around a player's avatar: online status, never a cosmetic. Yourself from your status,
 * friends from the friends list; nobody else shows one.
 */
export const statusOf = (userId: string): Readable<DotKind | null> =>
  derived([me, currentUser], ([$me, $user]) => {
    if ($user?.id === userId) return $user.invisible ? 'offline' : 'online'
    return $me?.friends?.friends.find(f => f.id === userId)?.status.kind ?? null
  })
