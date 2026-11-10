// Your achievements while a page shows them: read from GET /api/achievements, and read again after
// every achievement.unlocked on /ws/me. A 404 (achievements.enabled off for you) reads as null.
import { readable, type Readable } from 'svelte/store'
import { api } from '$lib/api/client'
import { me } from '$lib/lobby/sockets'
import type { Achievements } from './view'

export async function fetchAchievements(userId?: string): Promise<Achievements | null> {
  const { data } = userId
    ? await api.GET('/api/users/{id}/achievements', { params: { path: { id: userId } } })
    : await api.GET('/api/achievements')
  return data ?? null
}

const reloaders = new Set<() => void>()
export const reloadAchievements = (): void => reloaders.forEach(r => r())

/** Your achievements; null until known (or while the flag is off). */
export const achievements: Readable<Achievements | null> = readable<Achievements | null>(null, set => {
  let stopped = false
  let latest = 0
  const load = () => {
    const n = ++latest
    void fetchAchievements().then(a => {
      if (!stopped && n === latest) set(a)
    })
  }
  load()
  reloaders.add(load)
  const unsub = me.achievements.subscribe(m => m && load())
  return () => {
    stopped = true
    reloaders.delete(load)
    unsub()
  }
})

export async function saveShowcase(ids: string[]): Promise<void> {
  await api.PUT('/api/achievements/showcase', { body: { ids } })
  reloadAchievements()
}

export async function markSeen(): Promise<void> {
  await api.POST('/api/achievements/seen')
  reloadAchievements()
}
