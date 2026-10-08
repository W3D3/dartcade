<script lang="ts">
  // The floating box of a popover: a menu's items, a suggestion list, or other content (the lobby
  // QR code). Goes inside a bits-ui Popover.Root (Popover, AddBot, AddSomeone). It's portalled
  // to the body, so a scrolling list it sits in (the people list) can't clip it, and bits-ui
  // places it: below its trigger, above when there's no room, shifted to stay on screen.
  import type { Snippet } from 'svelte'
  import { Popover } from 'bits-ui'

  let {
    label,
    role = 'menu',
    align = 'left',
    width,
    anchor,
    keepFocus = false,
    children,
  }: {
    label: string
    /** 'menu' (default) for a list of menuitems; 'dialog' for other floating content. */
    role?: 'menu' | 'dialog'
    /** stretch: as wide as what it's under (suggestions under a field). */
    align?: 'left' | 'right' | 'stretch'
    width?: number
    /** What it's placed against when that isn't a Popover.Trigger (the field it suggests for). */
    anchor?: HTMLElement
    /** Leave focus where it is on open and close (typing goes on in the field). */
    keepFocus?: boolean
    children: Snippet
  } = $props()

  const noFocusMove = (e: Event) => {
    if (keepFocus) e.preventDefault()
  }
</script>

<Popover.Portal>
  <Popover.Content
    {role}
    aria-label={label}
    side="bottom"
    align={align === 'right' ? 'end' : 'start'}
    sideOffset={6}
    collisionPadding={8}
    customAnchor={anchor ?? null}
    trapFocus={!keepFocus}
    onOpenAutoFocus={noFocusMove}
    onCloseAutoFocus={noFocusMove}
    style="width: {align === 'stretch' ? 'var(--bits-popover-anchor-width)' : width ? `${width}px` : 'auto'}"
    class="z-[60] box-border max-w-[calc(100vw-16px)] max-h-[var(--bits-popover-content-available-height)] p-[6px]
           rounded-[12px] bg-surface-inset border border-line-popover overflow-y-auto
           shadow-[0_18px_48px_rgba(0,0,0,0.55)] flex flex-col gap-[2px] outline-none"
  >
    {@render children()}
  </Popover.Content>
</Popover.Portal>
