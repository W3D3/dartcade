<script lang="ts">
  // The floating box below what opened it: a menu's items, a suggestion list, or other content
  // anchored to a trigger (the lobby QR code). It's fixed to the viewport and placed against its
  // parent (the anchor), so a scrolling list it sits in (the people list) can't clip it; it opens
  // upwards when there's more room above.
  import type { Snippet } from 'svelte'

  let {
    label,
    role = 'menu',
    align = 'left',
    width,
    children,
  }: {
    label: string
    /** 'menu' (default) for a list of menuitems; 'dialog' for other floating content. */
    role?: 'menu' | 'dialog'
    /** stretch: as wide as what it's under (suggestions under a field). */
    align?: 'left' | 'right' | 'stretch'
    width?: number
    children: Snippet
  } = $props()

  const GAP = 6

  function anchored(panel: HTMLElement) {
    const anchor = panel.parentElement
    if (!anchor) return
    const place = () => {
      const a = anchor.getBoundingClientRect()
      const below = window.innerHeight - a.bottom - GAP
      const above = a.top - GAP
      const up = panel.offsetHeight > below && above > below
      const s = panel.style
      s.top = up ? '' : `${a.bottom + GAP}px`
      s.bottom = up ? `${window.innerHeight - a.top + GAP}px` : ''
      s.maxHeight = `${Math.max((up ? above : below) - GAP, 0)}px`
      s.left = align === 'right' ? '' : `${a.left}px`
      s.right = align === 'left' ? '' : `${document.documentElement.clientWidth - a.right}px`
    }
    place()
    // Capture: scrolling any ancestor moves the anchor
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return {
      destroy() {
        window.removeEventListener('scroll', place, true)
        window.removeEventListener('resize', place)
      },
    }
  }
</script>

<div
  {role}
  aria-label={label}
  style:width={width ? `${width}px` : undefined}
  use:anchored
  class="fixed z-[6] box-border p-[6px] rounded-[12px] bg-surface-inset border border-line-popover overflow-y-auto
         shadow-[0_18px_48px_rgba(0,0,0,0.55)] flex flex-col gap-[2px]"
>
  {@render children()}
</div>
