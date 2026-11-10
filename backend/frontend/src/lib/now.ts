import { readable, type Readable } from 'svelte/store'

/** The current time in ms, refreshed every `intervalMs` while something subscribes. */
export const now = (intervalMs: number): Readable<number> =>
  readable(Date.now(), set => {
    const id = setInterval(() => set(Date.now()), intervalMs)
    return () => clearInterval(id)
  })

/** Ticks while something subscribes, for the timers on the ranked cards. */
export const tick = now(250)
