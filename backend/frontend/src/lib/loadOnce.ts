import { writable, type Readable } from 'svelte/store'

export type LoadOnce<T> = Readable<T> & {
  /** Load again (after something changed it on the server). */
  refresh(): Promise<void>
  /** Replace the value without loading (e.g. cleared on sign-out). */
  set(value: T): void
}

/**
 * A value loaded from the server the first time something uses it, then kept for the
 * whole app: pages come and go on navigation, the value doesn't reload with them.
 */
export function loadOnce<T>(fetch: () => Promise<T>, initial: T): LoadOnce<T> {
  const store = writable(initial)
  let started = false
  async function refresh(): Promise<void> {
    // An explicit load counts as the first: subscribing afterwards doesn't load again
    started = true
    try { store.set(await fetch()) } catch { /* keep what we have */ }
  }
  return {
    subscribe(run) {
      if (!started) { started = true; void refresh() }
      return store.subscribe(run)
    },
    refresh,
    set: store.set,
  }
}
