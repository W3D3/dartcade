import { writable, type Readable } from 'svelte/store'

/** What a toast shows; `id` changes with every show, so a repeated message restarts its animation. */
export type Toast<T> = { value: T; id: number }
export type ToastStore<T> = Readable<Toast<T> | null> & { show: (value: T) => void; dismiss: () => void }

/** A message shown for a while. A newer one replaces it and starts the time again. */
export function createToast<T>(durationMs: number): ToastStore<T> {
  const { subscribe, set } = writable<Toast<T> | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let id = 0

  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const show = (value: T) => {
    clear()
    id += 1
    set({ value, id })
    timer = setTimeout(() => {
      timer = null
      set(null)
    }, durationMs)
  }
  const dismiss = () => {
    clear()
    set(null)
  }
  return { subscribe, show, dismiss }
}
