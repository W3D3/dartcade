<script lang="ts">
  import LegPips from './LegPips.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import { x01Roll } from '$lib/playerStats'
  import RowShell from './RowShell.svelte'
  import type { PillKind } from './pills.js'
  import type { X01PlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'

  let {
    name,
    p,
    active,
    pill,
    seat = null,
  }: { name: string; p: X01PlayerView; active: boolean; pill: PillKind | null; seat?: SeatLine | null } = $props()
  // Stacked rows (portrait tablets): only the thrower's stats; the others keep their leg pips
  const stacked = $derived(active ? '' : '@max-lg:hidden')
</script>

<!-- Tablets, by the row's own width: from 672 px three columns; 512 to 672 px (landscape
     around 1024) narrower ones without Last and a smaller score; below 512 px (beside the board in portrait) name,
     score and stats stacked, the stats only for the thrower (leg pips for everyone) -->
<RowShell
  {name}
  {active}
  {pill}
  {seat}
  class="{active
    ? 'grid-cols-[190px_150px_minmax(0,1fr)]'
    : 'grid-cols-[190px_120px_minmax(0,1fr)]'} xl:grid-cols-[200px_170px_minmax(0,1fr)]
         max-xl:@lg:@max-2xl:gap-3 {active
    ? 'max-xl:@lg:@max-2xl:grid-cols-[140px_140px_minmax(0,1fr)]'
    : 'max-xl:@lg:@max-2xl:grid-cols-[140px_110px_minmax(0,1fr)]'}
         @max-lg:grid-cols-1 @max-lg:gap-3 {active ? 'py-4 xl:py-5' : 'py-3 xl:py-4'}"
>
  <span
    class="font-display font-bold leading-[0.85] tabular-nums
               {active ? 'text-[min(120px,13vh)] max-xl:@lg:@max-2xl:text-[min(96px,13vh)] text-text' : 'text-[min(88px,9vh)] text-ink-3'}"
    ><RollingNumber {...x01Roll(p)} /></span
  >

  <div
    class="grid grid-cols-[minmax(0,1fr)_64px_64px_auto] gap-3 max-xl:@lg:@max-2xl:grid-cols-[minmax(0,1fr)_56px_auto]
              xl:grid-cols-[minmax(0,1fr)_90px_90px_auto] xl:gap-5 items-center min-w-0
              {active ? '' : '@max-lg:grid-cols-[auto]'}"
  >
    {#if p.showFinish}
      <span class="flex flex-col gap-1 min-w-0 {stacked}">
        <span class="text-[12px] label-caps whitespace-nowrap truncate {active ? 'text-text-muted' : 'text-text-dim'}">Can finish</span>
        {#if !p.opened}
          <span class="text-[14px] text-text-dim truncate">Needs to open</span>
        {:else if p.canFinish}
          <span
            class="font-display font-bold leading-none whitespace-nowrap truncate
                     {active ? 'text-[26px] xl:text-[34px] text-accent' : 'text-[20px] xl:text-[24px] text-ink-3'}">{p.canFinish}</span
          >
        {:else}
          <span class="text-[13px] xl:text-[14px] text-text-dim truncate">No finish yet</span>
        {/if}
      </span>
    {:else}
      <span class={stacked}></span>
    {/if}
    {#each [{ label: 'Last', value: p.last }, { label: 'Avg', value: p.avg }] as s (s.label)}
      <span class="flex flex-col gap-1 {stacked} {s.label === 'Last' ? 'max-xl:@lg:@max-2xl:hidden' : ''}">
        <span class="text-[12px] label-caps {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
        <span
          class="font-display font-bold leading-none tabular-nums {active
            ? 'text-[26px] xl:text-[34px] text-text'
            : 'text-[20px] xl:text-[24px] text-ink-2'}">{s.value}</span
        >
      </span>
    {/each}
    <LegPips total={p.firstTo} won={p.legsWon} {active} />
  </div>
</RowShell>
