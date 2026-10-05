import { writable, type Readable } from 'svelte/store'

export type LoadOnce<T> = Readable<T> & {
  /** Load again (after something changed it on the server). */
  refresh(): Promise<void>
  /** Replace the value without loading (e.g. cleared on sign-out). */
  set(value: T): void
}

/**
 * A value loaded from the server the first time something uses it, then kept for the
 * whole app: pages come and go on navigation, the value doesn't reload with them. A load
 * that fails doesn't count: the next use loads again.
 */
export function loadOnce<T>(fetch: () => Promise<T>, initial: T): LoadOnce<T> {
  const store = writable(initial)
  // Loaded (or loading): a use doesn't need to load. Cleared again when a load fails.
  let started = false
  async function refresh(): Promise<void> {
    // An explicit load counts as the first: subscribing afterwards doesn't load again
    started = true
    try {
      store.set(await fetch())
    } catch {
      started = false /* keep what we have; the next use retries */
    }
  }
  return {
    subscribe(run) {
      if (!started) void refresh()
      return store.subscribe(run)
    },
    refresh,
    set: store.set,
  }
}
