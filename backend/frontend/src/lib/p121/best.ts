// The viewer's all-time best of one stat in one mode (121's Highest target ever), shared by every
// screen that shows it. Each screen refreshes it when it opens; sign-out clears it.
import { api } from '$lib/api'
import { loadOnce, type LoadOnce } from '../loadOnce.js'

export type Best = { value: number; finishedAt: string } | null

const stores = new Map<string, LoadOnce<Best>>()

export function bestStat(mode: string, stat: string): LoadOnce<Best> {
  const key = `${mode}:${stat}`
  let store = stores.get(key)
  if (!store) {
    store = loadOnce<Best>(async () => {
      const { data } = await api.GET('/api/games/best', { params: { query: { mode, stat } } })
      return data?.best ?? null
    }, null)
    stores.set(key, store)
  }
  return store
}

/** Signed out (or switching user): forget every best, so the next viewer never sees them. */
export function clearBests(): void {
  for (const store of stores.values()) store.set(null)
  stores.clear()
}
