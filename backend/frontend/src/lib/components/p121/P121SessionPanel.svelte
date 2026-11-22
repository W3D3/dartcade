<!--
  121's session panel beside the board in solo (P121-Game): made, highest and average darts, the
  target ladder, the tries still to come, and the viewer's Highest target ever.
-->
<script lang="ts">
  import type { P121Game } from '$lib/api/game-ws'
  import P121Ladder from '$lib/components/p121/P121Ladder.svelte'
  import PracticeSessionPanel from '$lib/components/practice/PracticeSessionPanel.svelte'
  import { plural } from '$lib/fmt'

  let { game, seat, visitDarts = 0 }: { game: P121Game; seat: number; visitDarts?: number } = $props()

  const s = $derived(game.seats[seat])
  const after = $derived(game.cfg.tries - s.tries.length - 1)
</script>

<PracticeSessionPanel
  count={plural(game.cfg.tries, 'try', 'tries')}
  mode="p121"
  stat="highestMade"
  bestLabel="Highest target ever"
  ladderLabel="Target ladder"
>
  {#snippet stats()}
    <div class="grid grid-cols-3 gap-3">
      {#each [{ k: 'Made', v: `${s.made}/${s.tries.length}`, unit: '' }, { k: 'Highest', v: String(s.highestMade ?? '–'), unit: '' }, { k: 'Avg', v: s.avgDarts === null ? '–' : s.avgDarts.toFixed(1), unit: 'darts' }] as stat (stat.k)}
        <div class="flex flex-col gap-1">
          <span class="text-[12px] font-semibold label-caps text-text-dim">{stat.k}</span>
          <span class="flex items-baseline gap-[6px]">
            <span class="font-display font-bold text-[40px] leading-none">{stat.v}</span>
            {#if stat.unit}<span class="text-[12px] text-text-dim">{stat.unit}</span>{/if}
          </span>
        </div>
      {/each}
    </div>
  {/snippet}
  {#snippet ladder()}
    <P121Ladder {game} {seat} {visitDarts} variant="list" />
    {#if after > 0}<span class="text-[12px] text-line-strong pt-[6px]">{plural(after, 'more try', 'more tries')} after this one</span>{/if}
  {/snippet}
</PracticeSessionPanel>
