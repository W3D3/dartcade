import { readable, type Readable } from 'svelte/store'
import { NARROW_MATCH_QUERY } from './matchLayout.js'

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

/** Wide enough for a team panel on each side of the board (Tailwind's `xl`); narrower stacks them. */
export const WIDE_QUERY = '(min-width: 1280px)'

export const isWide: Readable<boolean> = mediaStore(WIDE_QUERY, browserMatchMedia)

/** The tablet band, Tailwind's `md` up to `xl` (768 to 1279.98 px): the icon rail and the tablet sizes. */
export const TABLET_QUERY = '(min-width: 768px) and (max-width: 1279.98px)'

export const isTablet: Readable<boolean> = mediaStore(TABLET_QUERY, browserMatchMedia)

/** Too narrow for a player panel either side of the board (`NARROW_MATCH_QUERY`): two players stack as rows. */
export const isNarrowMatch: Readable<boolean> = mediaStore(NARROW_MATCH_QUERY, browserMatchMedia)
