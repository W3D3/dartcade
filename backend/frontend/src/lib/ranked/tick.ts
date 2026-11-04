import { readable } from 'svelte/store'

/** Ticks while something subscribes, for the timers on these cards. */
export const tick = readable(Date.now(), set => {
  const id = setInterval(() => set(Date.now()), 250)
  return () => clearInterval(id)
})
