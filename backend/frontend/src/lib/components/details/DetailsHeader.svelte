<script lang="ts">
  // The details page's header bar: back to History, the mode, the meta line and your result.
  import { ArrowLeft } from '@lucide/svelte'
  import type { GameDetail } from '$lib/api'
  import { getGameView } from '$lib/gameViews'
  import { resultLabel } from '$lib/history'
  import { metaLine } from '$lib/details/page'

  let { detail }: { detail: GameDetail } = $props()
  const result = $derived(resultLabel(detail.game))
</script>

<header
  class="shrink-0 flex flex-wrap items-center gap-x-6 gap-y-2 min-h-14 md:min-h-16 box-border px-4 md:px-7 py-2 border-b border-line bg-surface-1"
>
  <a
    href="#/history"
    class="h-11 flex items-center gap-2 pl-[10px] pr-[14px] rounded-[10px] border border-line-strong text-ink-2 no-underline text-[14px] font-medium hover:text-text"
    ><ArrowLeft size={16} />History</a
  >
  <div class="flex items-baseline gap-3 min-w-0 flex-wrap">
    <h1 class="m-0 font-display font-bold text-[24px] md:text-[26px] uppercase tracking-[0.04em]">{getGameView(detail.game.mode).title}</h1>
    <span class="text-[13px] md:text-[14px] text-text-muted">{metaLine(detail)}</span>
  </div>
  {#if result.text}
    <span
      class="ml-auto h-[30px] px-3 inline-flex items-center rounded-full text-[13px] font-bold tracking-[0.08em] uppercase
             {result.won ? 'bg-accent text-accent-fg' : 'border border-line-chip text-ink-2'}">{result.text}</span
    >
  {/if}
</header>
