<script lang="ts">
  // The big screen's top bar: the wordmark, the game and its rules, the board's name and a status badge.
  import type { Snippet } from 'svelte'
  import Wordmark from '$lib/components/Wordmark.svelte'

  let { title, meta, board, badge }: { title: string; meta: string; board: string | null; badge: Snippet } = $props()
</script>

<header class="flex h-[110px] flex-none items-center gap-7 border-b-2 border-surface-inset px-[44px]">
  <Wordmark size={36} text="text-[36px]" badge={false} />
  <span class="h-11 w-0.5 bg-line"></span>
  <span class="whitespace-nowrap font-display text-[44px] font-bold">{title}</span>
  <span class="min-w-0 truncate text-[30px] text-text-muted">{meta}</span>
  <span class="ml-auto flex items-center gap-5">
    {#if board}<span class="whitespace-nowrap font-display text-[34px] font-bold uppercase tracking-[0.04em] text-ink-2">{board}</span>{/if}
    {@render badge()}
  </span>
</header>
