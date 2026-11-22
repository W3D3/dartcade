<!--
  The session panel beside the board in solo (121 Checkout, Catch 40): a count, the mode's stats and
  ladder, and the viewer's best of one stat ever (hidden without one).
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { dayMonth } from '$lib/fmt'
  import { bestStat } from '$lib/p121/best'

  let {
    count,
    mode,
    stat,
    bestLabel,
    stats,
    ladder,
    ladderLabel,
  }: {
    /** The header's count, e.g. "10 tries". */
    count: string
    /** The mode and stat of the viewer's best (GET /api/games/best). */
    mode: string
    stat: string
    bestLabel: string
    stats: Snippet
    ladder: Snippet
    ladderLabel: string
  } = $props()

  // svelte-ignore state_referenced_locally
  const best = bestStat(mode, stat)
  // Fresh for each screen (a game just finished may have raised it); before the first subscribe, so it loads once
  void best.refresh()
  const label = 'text-[12px] font-semibold label-caps text-text-dim'
</script>

<aside
  aria-label="This session"
  class="w-[280px] xl:w-[360px] shrink-0 box-border p-5 xl:px-6 xl:py-[22px] rounded-panel border border-line bg-surface-1 flex flex-col gap-[18px] min-h-0 overflow-y-auto"
>
  <div class="flex items-baseline justify-between">
    <h2 class="font-display font-bold text-[30px] uppercase">This session</h2>
    <span class="font-mono text-[12px] text-text-dim">{count}</span>
  </div>
  {@render stats()}
  <div class="flex flex-col gap-2">
    <span class={label}>{ladderLabel}</span>
    {@render ladder()}
  </div>
  {#if $best}
    <div class="mt-auto px-4 py-[14px] rounded-lg bg-surface-active flex items-center justify-between">
      <span class="text-[14px] text-ink-2">{bestLabel}</span>
      <span class="font-display font-bold text-[30px]"
        >{$best.value} <span class="font-sans font-normal text-[13px] text-text-dim">· {dayMonth(new Date($best.finishedAt))}</span></span
      >
    </div>
  {/if}
</aside>
