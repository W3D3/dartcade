<!-- The one loading indicator: a ring that turns (softly pulses under reduced motion). `inline`
     (16px) sits next to a button's label, `block` (24px) fills a section, `page` (40px) a whole
     page. Without a `label` it is decoration: the button or block around it says what is loading. -->
<script lang="ts">
  import { LoaderCircle } from '@lucide/svelte'
  import { cn } from '$lib/utils.js'

  type Size = 'inline' | 'block' | 'page'
  const PX: Record<Size, number> = { inline: 16, block: 24, page: 40 }

  let { size = 'inline', label, class: className = '' }: { size?: Size; label?: string; class?: string } = $props()
</script>

<span
  class={cn('inline-flex shrink-0 text-text-muted', size === 'page' && 'text-accent', className)}
  role={label ? 'status' : undefined}
  aria-live={label ? 'polite' : undefined}
  aria-hidden={label ? undefined : 'true'}
>
  <LoaderCircle size={PX[size]} class="animate-spin motion-reduce:animate-skeleton-soft" aria-hidden="true" />
  {#if label}<span class="sr-only">{label}</span>{/if}
</span>
