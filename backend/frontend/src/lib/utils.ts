import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type WithElementRef<T, E extends Element = Element> = T & {
  ref?: E | null
}

export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>

/** Collapses a burst of calls into one, `ms` after the last; `cancel` drops a pending one. */
export function debounced(fn: () => void, ms: number): { call: () => void; cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (t) clearTimeout(t)
    t = null
  }
  return {
    call: () => {
      cancel()
      t = setTimeout(() => {
        t = null
        fn()
      }, ms)
    },
    cancel,
  }
}
