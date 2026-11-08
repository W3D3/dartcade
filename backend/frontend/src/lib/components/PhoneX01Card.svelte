<script lang="ts">
  import type { Who } from '$lib/face'
  // The X01 thrower on a phone: name, board, Throwing pill, leg pips, big score, averages, chalkboard.
  import Chalkboard from './Chalkboard.svelte'
  import LegPips from './LegPips.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import PagedStats from './PagedStats.svelte'
  import { x01Pages, x01Roll } from '$lib/playerStats'
  import PhoneCardShell from './PhoneCardShell.svelte'
  import type { PillKind } from './pills.js'
  import type { X01PlayerView } from '$lib/playerStats'
  import type { SeatLine } from '$lib/remote'
  import type { SeatRank } from '$lib/ranked/inGame'

  let {
    who,
    p,
    pill,
    seat,
    rank = null,
    chalkboard,
  }: {
    who: Who
    p: X01PlayerView
    pill: PillKind | null
    seat: SeatLine | null
    rank?: SeatRank | null
    chalkboard: boolean
  } = $props()
  const name = $derived(who.name)
</script>

<PhoneCardShell {who} label="{name}, throwing, {p.remaining} left" {pill} {seat} {rank} class="gap-2">
  {#snippet aside()}
    {#if p.firstTo > 1}<span class="ml-auto"><LegPips total={p.firstTo} won={p.legsWon} active /></span>{/if}
  {/snippet}
  <!-- Short screens (≤ 740 px tall) drop the chalkboard and shrink the score so the board keeps its room;
       the stat strip spans the card under both -->
  <div
    class="grid gap-x-3 gap-y-[6px] items-end grid-cols-1 {chalkboard ? '[@media(min-height:741px)]:grid-cols-[minmax(0,1fr)_150px]' : ''}"
  >
    <div class="flex flex-col gap-[6px] min-w-0">
      <span class="font-display font-bold text-[64px] [@media(min-height:741px)]:text-[104px] leading-[0.8] tracking-score tabular-nums"
        ><RollingNumber {...x01Roll(p)} /></span
      >
      {#if !p.opened}<span class="text-[12px] label-caps text-text-muted">Needs to open</span>{/if}
    </div>
    {#if chalkboard}<div class="hidden [@media(min-height:741px)]:flex h-[124px] flex-col overflow-hidden">
        <Chalkboard visits={p.visits} current={p.current} active />
      </div>{/if}
    <div class="hidden [@media(min-height:600px)]:block col-span-full">
      <PagedStats pages={x01Pages(p)} active class="[--stat-label:min(10px,2.9vw)] [--stat-value:22px]" />
    </div>
  </div>
</PhoneCardShell>
