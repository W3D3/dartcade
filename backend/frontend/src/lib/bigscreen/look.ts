// What the big screen's views share: the text classes and the one place landscape and portrait differ.
import type { Orientation } from './stage.js'

export const LABEL = 'text-[24px] font-bold tracking-[0.12em] text-text-dim'
export const NUM = 'font-display font-bold'

type VisitSize = { height: number; totalSize: number; tileSize: number }

/** `visit` is the open visit's row; `compact` is for games with another panel under it. */
export const LIVE_SIZES: Record<Orientation, { portrait: boolean; main: string; visit: VisitSize; compact: VisitSize }> = {
  landscape: {
    portrait: false,
    main: 'gap-10 px-[44px]',
    visit: { height: 200, totalSize: 116, tileSize: 88 },
    compact: { height: 180, totalSize: 108, tileSize: 88 },
  },
  portrait: {
    portrait: true,
    main: 'flex-col gap-6 px-10',
    visit: { height: 190, totalSize: 108, tileSize: 80 },
    compact: { height: 180, totalSize: 100, tileSize: 80 },
  },
}
export type LiveSizes = (typeof LIVE_SIZES)[Orientation]
