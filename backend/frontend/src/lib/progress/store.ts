// Your progress while a page shows it: read from GET /api/progress/me, and read again after every
// xp.gained on /ws/me (its XP shows at once). What one game paid comes from that push too, or from
// the API after a reload.
import { derived, readable, type Readable } from 'svelte/store'
import { api } from '$lib/api/client'
import { me } from '$lib/lobby/sockets'
import { flag } from '$lib/flags'
import type { XpGainedMessage, XpLine } from '$lib/api/lobby-ws'
import type { components } from '$lib/api/schema'

export type Progress = components['schemas']['Progress']
type Source = { xp: Readable<XpGainedMessage | null> }

// Every open progress store, to read again after you change something (your look)
const reloaders = new Set<() => void>()
export function reloadProgress(): void {
  for (const r of reloaders) r()
}

/** Your progress; null until known. */
export function createProgress(source: Source = me, fetchProgress = defaultFetchProgress): Readable<Progress | null> {
  return readable<Progress | null>(null, set => {
    let current: Progress | null = null
    let stopped = false
    let latest = 0
    const load = () => {
      const n = ++latest
      void fetchProgress().then(p => {
        // An older read never overwrites a newer one
        if (stopped || n !== latest || !p) return
        current = p
        set(p)
      })
    }
    load()
    reloaders.add(load)
    const unsub = source.xp.subscribe(m => {
      if (!m) return
      if (current) {
        current = { ...current, xp: m.xpAfter, level: m.levelAfter }
        set(current)
      }
      // The streak (and the rest) moved too
      load()
    })
    return () => {
      stopped = true
      reloaders.delete(load)
      unsub()
    }
  })
}

async function defaultFetchProgress(): Promise<Progress | null> {
  const { data } = await api.GET('/api/progress/me')
  return data ?? null
}

/** Your progress while progression is on for you; null otherwise (nothing is fetched then). */
export const progress: Readable<Progress | null> = readable<Progress | null>(null, set => {
  let inner: (() => void) | null = null
  let was = false
  const unflag = flag('progression.enabled').subscribe(on => {
    // The flags poll: only a change matters
    if (on === was) return
    was = on
    inner?.()
    inner = null
    set(null)
    if (on) inner = createProgress().subscribe(set)
  })
  return () => {
    inner?.()
    unflag()
  }
})

/** Your total XP, while progression is on for you. */
export const progressXp: Readable<number | null> = derived(progress, p => p?.xp ?? null)

/** What a game paid you: lines, total, and your XP before and after. */
export type GameGain = {
  lines: XpLine[]
  total: number
  xpBefore: number
  xpAfter: number
  unlocks?: string[]
  /** Challenges the game finished: claimed on Progress (only known from the push) */
  challenges?: { title: string; xp: number }[]
}

/** What game `sessionId` paid you; null until it is settled (or it paid nothing). */
export function createGameGain(sessionId: string, source: Source = me, fetchGain = defaultFetchGain): Readable<GameGain | null> {
  return readable<GameGain | null>(null, set => {
    let pushed = false
    let stopped = false
    const unsub = source.xp.subscribe(m => {
      if (m?.sessionId !== sessionId) return
      pushed = true
      set({
        lines: m.lines,
        total: m.total,
        xpBefore: m.xpBefore,
        xpAfter: m.xpAfter,
        unlocks: m.unlocks ?? [],
        challenges: m.challenges ?? [],
      })
    })
    // After a reload the push is gone: the API has it (the bar then starts where it ends up)
    void fetchGain(sessionId).then(g => {
      if (!stopped && !pushed && g) set(g)
    })
    return () => {
      stopped = true
      unsub()
    }
  })
}

async function defaultFetchGain(sessionId: string): Promise<GameGain | null> {
  const { data } = await api.GET('/api/progress/games/{id}', { params: { path: { id: sessionId } } })
  return data ? { lines: data.lines, total: data.total, xpBefore: data.xp - data.total, xpAfter: data.xp } : null
}
