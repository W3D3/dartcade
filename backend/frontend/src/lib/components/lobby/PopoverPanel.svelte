<script lang="ts">
  // The floating box below what opened it: a menu's items, a suggestion list, or other content
  // anchored to a trigger (the lobby QR code).
  import type { Snippet } from 'svelte'

  let { label, role = 'menu', align = 'left', width, children }: {
    label: string
    /** 'menu' (default) for a list of menuitems; 'dialog' for other floating content. */
    role?: 'menu' | 'dialog'
    /** stretch: as wide as what it's under (suggestions under a field). */
    align?: 'left' | 'right' | 'stretch'
    width?: number
    children: Snippet
  } = $props()
</script>

<div {role} aria-label={label} style={width ? `width: ${width}px` : undefined}
  class="absolute top-[calc(100%+6px)] z-[6] box-border p-[6px] rounded-[12px] bg-surface-inset border border-line-popover
         shadow-[0_18px_48px_rgba(0,0,0,0.55)] flex flex-col gap-[2px]
         {align === 'right' ? 'right-0' : align === 'stretch' ? 'left-0 right-0' : 'left-0'}">
  {@render children()}
</div>
