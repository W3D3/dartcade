<!-- A pulsing block standing in for content that is still loading; `class` gives it the content's
     size. Or put the text it replaces in `children`: it is drawn invisible, so the block takes the
     text's own width and line height. Hidden from screen readers: the region it fills says it's
     loading (aria-busy, a status). -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { cn } from '$lib/utils.js'

  let { class: className = '', children }: { class?: string; children?: Snippet } = $props()
</script>

<span
  aria-hidden="true"
  class={cn(
    'block animate-skeleton motion-reduce:animate-skeleton-soft rounded-sm bg-surface-key',
    children && 'text-transparent select-none',
    className,
  )}>{@render children?.()}</span
>
