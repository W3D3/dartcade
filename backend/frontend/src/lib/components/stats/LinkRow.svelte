<script lang="ts">
  // A row that opens what it names (Stats.dc.html .lrow): a title (with an optional tag), a line
  // under it, a number on the right, a chevron.
  import type { Snippet } from 'svelte'
  import { ChevronRight } from '@lucide/svelte'

  let { href, title, sub, value, tag }: { href: string; title: Snippet; sub: string; value?: string; tag?: string } = $props()
</script>

<a
  {href}
  class="-mx-2.5 flex items-center gap-3 rounded-[10px] border-t border-surface-inset px-2.5 py-[9px] text-text no-underline hover:bg-surface-active hover:text-text"
>
  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
    <span class="text-[14px] font-semibold"
      >{@render title()}{#if tag}<span
          class="ml-2 rounded-[4px] bg-accent px-[5px] py-px align-[2px] text-[10px] font-bold tracking-[0.06em] text-accent-fg">{tag}</span
        >{/if}</span
    >
    <span class="truncate text-[12px] text-text-muted">{sub}</span>
  </span>
  {#if value}<span class="font-display text-[24px] font-bold">{value}</span>{/if}
  <ChevronRight size={16} class="shrink-0 text-text-muted" aria-hidden="true" />
</a>
