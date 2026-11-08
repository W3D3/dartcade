import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The canvas type and radius tokens from app.css `@theme`, so twMerge reads text-small as a font size
// (not a colour that text-ink would replace) and rounded-card as a radius.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'score',
        'hero',
        'glyph',
        'page-title',
        'checkout',
        'card-title',
        'section-title',
        'cta',
        'wordmark',
        'lead',
        'player-name',
        'body-lg',
        'body',
        'label',
        'small',
        'caption',
        'eyebrow',
        'pill',
        'mono',
        'mono-sm',
        'kicker',
      ],
      radius: ['bar', 'chip', 'segment', 'sm', 'key', 'md', 'lg', 'card', 'popover', 'panel', 'pill'],
      tracking: ['score', 'hero', 'title', 'section', 'wordmark', 'cta', 'caps'],
    },
  },
})

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
