<script lang="ts">
  // The floating box of a menu or a suggestion list, below what opened it.
  import type { Snippet } from 'svelte'

  let { label, align = 'left', width, children }: {
    label: string
    /** stretch: as wide as what it's under (suggestions under a field). */
    align?: 'left' | 'right' | 'stretch'
    width?: number
    children: Snippet
  } = $props()
</script>

<div role="menu" aria-label={label} style={width ? `width: ${width}px` : undefined}
  class="absolute top-[calc(100%+6px)] z-[6] box-border p-[6px] rounded-[12px] bg-surface-inset border border-line-popover
         shadow-[0_18px_48px_rgba(0,0,0,0.55)] flex flex-col gap-[2px]
         {align === 'right' ? 'right-0' : align === 'stretch' ? 'left-0 right-0' : 'left-0'}">
  {@render children()}
</div>
