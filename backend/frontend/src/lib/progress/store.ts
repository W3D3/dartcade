// Your XP while a page shows it: read once from GET /api/progress/me, then moved by every
// xp.gained on /ws/me. What one game paid comes from that push too, or from the API after a reload.
import { readable, type Readable } from 'svelte/store'
import { api } from '$lib/api/client'
import { me } from '$lib/lobby/sockets'
import { flag } from '$lib/flags'
import type { XpGainedMessage, XpLine } from '$lib/api/lobby-ws'

type Source = { xp: Readable<XpGainedMessage | null> }

/** Your total XP; null until known (or while progression is off for you). */
export function createProgress(source: Source = me, fetchXp = defaultFetchXp): Readable<number | null> {
  return readable<number | null>(null, set => {
    let pushed = false
    let stopped = false
    void fetchXp().then(xp => {
      if (!stopped && !pushed && xp !== null) set(xp)
    })
    const unsub = source.xp.subscribe(m => {
      if (!m) return
      pushed = true
      set(m.xpAfter)
    })
    return () => {
      stopped = true
      unsub()
    }
  })
}

async function defaultFetchXp(): Promise<number | null> {
  const { data } = await api.GET('/api/progress/me')
  return data?.xp ?? null
}

/** Your total XP while progression is on for you; null otherwise (nothing is fetched then). */
export const progressXp: Readable<number | null> = readable<number | null>(null, set => {
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

/** What a game paid you: lines, total, and your XP before and after. */
export type GameGain = { lines: XpLine[]; total: number; xpBefore: number; xpAfter: number }

/** What game `sessionId` paid you; null until it is settled (or it paid nothing). */
export function createGameGain(sessionId: string, source: Source = me, fetchGain = defaultFetchGain): Readable<GameGain | null> {
  return readable<GameGain | null>(null, set => {
    let pushed = false
    let stopped = false
    const unsub = source.xp.subscribe(m => {
      if (m?.sessionId !== sessionId) return
      pushed = true
      set({ lines: m.lines, total: m.total, xpBefore: m.xpBefore, xpAfter: m.xpAfter })
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
