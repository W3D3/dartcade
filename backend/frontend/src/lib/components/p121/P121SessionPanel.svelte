<!--
  121's session panel beside the board in solo (P121-Game): made, highest and average darts, the
  target ladder, the tries still to come, and the viewer's Highest target ever (hidden without one).
-->
<script lang="ts">
  import type { P121Game } from '$lib/api/game-ws'
  import P121Ladder from '$lib/components/p121/P121Ladder.svelte'
  import { dayMonth, plural } from '$lib/fmt'
  import { bestStat } from '$lib/p121/best'

  let { game, seat, visitDarts = 0 }: { game: P121Game; seat: number; visitDarts?: number } = $props()

  const best = bestStat('p121', 'highestMade')
  // Fresh for each screen (a game just finished may have raised it); before the first subscribe, so it loads once
  void best.refresh()
  const s = $derived(game.seats[seat])
  const after = $derived(game.cfg.tries - s.tries.length - 1)
  const label = 'text-[12px] font-semibold label-caps text-text-dim'
</script>

<aside
  aria-label="This session"
  class="w-[280px] xl:w-[360px] shrink-0 box-border px-5 py-5 xl:px-6 xl:py-[22px] rounded-[18px] border border-line bg-surface-1 flex flex-col gap-[18px] min-h-0 overflow-y-auto"
>
  <div class="flex items-baseline justify-between">
    <h2 class="m-0 font-display font-bold text-[30px] uppercase">This session</h2>
    <span class="font-mono text-[12px] text-text-dim">{plural(game.cfg.tries, 'try', 'tries')}</span>
  </div>
  <div class="grid grid-cols-3 gap-3">
    {#each [{ k: 'Made', v: `${s.made}/${s.tries.length}`, unit: '' }, { k: 'Highest', v: String(s.highestMade ?? '–'), unit: '' }, { k: 'Avg', v: s.avgDarts === null ? '–' : s.avgDarts.toFixed(1), unit: 'darts' }] as stat (stat.k)}
      <div class="flex flex-col gap-1">
        <span class={label}>{stat.k}</span>
        <span class="flex items-baseline gap-[6px]">
          <span class="font-display font-bold text-[40px] leading-none">{stat.v}</span>
          {#if stat.unit}<span class="text-[12px] text-text-dim">{stat.unit}</span>{/if}
        </span>
      </div>
    {/each}
  </div>
  <div class="flex flex-col gap-2">
    <span class={label}>Target ladder</span>
    <P121Ladder {game} {seat} {visitDarts} variant="list" />
    {#if after > 0}<span class="text-[12px] text-line-strong pt-[6px]">{plural(after, 'more try', 'more tries')} after this one</span>{/if}
  </div>
  {#if $best}
    <div class="mt-auto px-4 py-[14px] rounded-[12px] bg-surface-active flex items-center justify-between">
      <span class="text-[14px] text-ink-2">Highest target ever</span>
      <span class="font-display font-bold text-[30px]"
        >{$best.value} <span class="font-sans font-normal text-[13px] text-text-dim">· {dayMonth(new Date($best.finishedAt))}</span></span
      >
    </div>
  {/if}
</aside>
