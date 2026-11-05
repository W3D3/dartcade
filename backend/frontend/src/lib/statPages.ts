// The pages of a player card's stat strip: three stats each, switched by click, swipe or the dots.
export type Stat = { label: string; value: string; title?: string; dim?: boolean }

/** The page after `page`, back to the first after the last (a click on the strip). */
export const nextPage = (page: number, pages: number): number => (page + 1) % Math.max(pages, 1)

/** The page a vertical scroll position shows, when every page is `height` tall. */
export const pageAt = (scrollTop: number, height: number, pages: number): number =>
  height > 0 ? Math.min(Math.max(Math.round(scrollTop / height), 0), pages - 1) : 0
