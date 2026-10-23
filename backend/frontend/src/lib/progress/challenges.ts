// Your challenges while the Progress page shows them: read from GET /api/challenges, and again after
// every xp.gained (a game may have moved them on). Rerolling and claiming answer with the new sets.
import { get, readable, writable, type Readable } from 'svelte/store'
import { api } from '$lib/api/client'
import { reloadProgress } from '$lib/progress/store'
import { me } from '$lib/lobby/sockets'
import type { components } from '$lib/api/schema'
import type { XpGainedMessage } from '$lib/api/lobby-ws'

export type Challenges = components['schemas']['Challenges']
export type ChallengeSet = Challenges['daily']
export type ChallengeItem = ChallengeSet['items'][number]

type Fetcher = () => Promise<Challenges | null>
type Source = { xp: Readable<XpGainedMessage | null> }

export function createChallenges(source: Source = me, fetchChallenges: Fetcher = defaultFetch) {
  const value = writable<Challenges | null>(null)
  let latest = 0
  const load = () => {
    const n = ++latest
    void fetchChallenges().then(c => {
      if (c && n === latest) value.set(c)
    })
  }
  const store = readable<Challenges | null>(null, set => {
    const unvalue = value.subscribe(set)
    load()
    let first = true
    const unxp = source.xp.subscribe(m => {
      // The last push from before isn't news
      if (first || !m) return
      load()
    })
    first = false
    return () => {
      unvalue()
      unxp()
    }
  })
  return {
    subscribe: store.subscribe,
    /** Swaps a daily for another; resolves with an error message, or null when done. */
    async reroll(id: string): Promise<string | null> {
      latest++
      const { data } = await api.POST('/api/challenges/{id}/reroll', { params: { path: { id } } })
      if (!data) return "Couldn't reroll it."
      value.set(data)
      return null
    },
    /** Takes a finished challenge's XP; resolves with what it paid and your XP after, or an error message. */
    async claim(id: string): Promise<{ gained: number; xpAfter: number; error: string | null }> {
      latest++
      const before = get(value)
      const { data } = await api.POST('/api/challenges/{id}/claim', { params: { path: { id } } })
      if (!data) return { gained: 0, xpAfter: 0, error: "Couldn't claim it." }
      value.set(data.challenges)
      reloadProgress()
      const was = before && [...before.daily.items, ...before.weekly.items].find(c => c.id === id)
      return { gained: was && !was.claimed ? was.xp : 0, xpAfter: data.xp, error: null }
    },
  }
}

async function defaultFetch(): Promise<Challenges | null> {
  const { data } = await api.GET('/api/challenges')
  return data ?? null
}

/** 'Resets in 6 h' (minutes in its last hour) for a day; 'Resets Monday' for a week. */
export function resetsText(set: ChallengeSet, period: 'daily' | 'weekly', now: Date): string {
  if (period === 'weekly') return 'Resets Monday'
  const mins = Math.max(0, Math.ceil((Date.parse(set.resetsAt) - now.getTime()) / 60_000))
  return mins >= 60 ? `Resets in ${Math.floor(mins / 60)} h` : `Resets in ${mins} m`
}

/** 'Daily 1 of 3': claimed of the set */
export const doneOf = (set: ChallengeSet): string => `${set.items.filter(c => c.claimed).length} of ${set.items.length}`
