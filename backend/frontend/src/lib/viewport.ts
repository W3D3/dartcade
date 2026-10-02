import { readable, type Readable } from 'svelte/store'

/** Below Tailwind's `md`: the phone layouts. */
export const PHONE_QUERY = '(max-width: 767.98px)'

type ChangeListener = (e: { matches: boolean }) => void
export type MatchMediaFn = (query: string) => {
  matches: boolean
  addEventListener(type: 'change', cb: ChangeListener): void
  removeEventListener(type: 'change', cb: ChangeListener): void
}

/** Whether `query` matches, kept up to date (false where there is no matchMedia). */
export function mediaStore(query: string, mm: MatchMediaFn | null): Readable<boolean> {
  if (!mm) return readable(false)
  const list = mm(query)
  return readable(list.matches, set => {
    // The viewport may have changed while nobody was subscribed
    set(list.matches)
    const onChange: ChangeListener = e => set(e.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  })
}

const browserMatchMedia: MatchMediaFn | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? q => {
        const list = window.matchMedia(q)
        return {
          get matches() { return list.matches },
          addEventListener: (_t, cb) => list.addEventListener('change', cb),
          removeEventListener: (_t, cb) => list.removeEventListener('change', cb),
        }
      }
    : null

/** The viewport is phone-sized: layouts CSS alone can't switch read this. */
export const isPhone: Readable<boolean> = mediaStore(PHONE_QUERY, browserMatchMedia)
