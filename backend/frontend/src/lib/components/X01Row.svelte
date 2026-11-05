<script lang="ts">
  import type { Who } from '$lib/face'
  import LegPips from './LegPips.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import { x01Averages, x01Roll } from '$lib/playerStats'
  import RowShell from './RowShell.svelte'
  import type { PillKind } from './pills.js'
  import type { X01PlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'

  let {
    who,
    p,
    active,
    pill,
    seat = null,
  }: {
    who: Who
    p: X01PlayerView
    active: boolean
    pill: PillKind | null
    seat?: SeatLine | null
  } = $props()
  // Stacked rows (narrow landscape windows; upright screens get the portrait layout): only the thrower's stats, the others keep their leg pips
  const stacked = $derived(active ? '' : '@max-lg:hidden')
  // By the row's own width: Checkout drops out first (below 768 px), then Last (below 1024 px), the averages stay
  const stats = $derived([
    { label: 'Last', value: p.last, hide: '@lg:@max-5xl:hidden' },
    ...x01Averages(p).map(a => ({ ...a, hide: '' })),
    { label: 'Checkout', value: p.checkout, title: `${p.checkoutDarts} darts at a finish`, hide: '@lg:@max-3xl:hidden' },
  ])
</script>

<!-- By the row's own width: from 1024 px the wide columns; 768 to 1024 px the averages and Checkout; 512 to 768 px (landscape
     around 1024) only the averages and a smaller score; below 512 px (beside the board in a narrow window) name,
     score and stats stacked, the stats only for the thrower (leg pips for everyone) -->
<RowShell
  {who}
  {active}
  {pill}
  {seat}
  class="{active
    ? 'grid-cols-[190px_150px_minmax(0,1fr)]'
    : 'grid-cols-[190px_120px_minmax(0,1fr)]'} @5xl:grid-cols-[200px_170px_minmax(0,1fr)]
         @lg:@max-3xl:gap-3 {active
    ? '@lg:@max-3xl:grid-cols-[140px_140px_minmax(0,1fr)]'
    : '@lg:@max-3xl:grid-cols-[140px_110px_minmax(0,1fr)]'}
         @max-lg:grid-cols-1 @max-lg:gap-3 {active ? 'py-4 xl:py-5' : 'py-3 xl:py-4'}"
>
  <span
    class="font-display font-bold leading-[0.85] tabular-nums
               {active ? 'text-[min(120px,13vh)] @lg:@max-3xl:text-[min(96px,13vh)] text-text' : 'text-[min(88px,9vh)] text-ink-3'}"
    ><RollingNumber {...x01Roll(p)} /></span
  >

  <div
    class="grid grid-cols-[minmax(0,1fr)_repeat(4,minmax(64px,max-content))_auto] gap-3
              @lg:@max-3xl:grid-cols-[minmax(0,1fr)_repeat(2,minmax(56px,max-content))_auto]
              @3xl:@max-5xl:grid-cols-[minmax(0,1fr)_repeat(3,minmax(64px,max-content))_auto]
              @5xl:grid-cols-[minmax(0,1fr)_repeat(4,90px)_auto] @5xl:gap-5 items-center min-w-0
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
                     {active ? 'text-[26px] @5xl:text-[34px] text-accent' : 'text-[20px] @5xl:text-[24px] text-ink-3'}">{p.canFinish}</span
          >
        {:else}
          <span class="text-[13px] @5xl:text-[14px] text-text-dim truncate">No finish yet</span>
        {/if}
      </span>
    {:else}
      <span class={stacked}></span>
    {/if}
    {#each stats as s (s.label)}
      <span class="flex flex-col gap-1 min-w-0 {stacked} {s.hide}" title={'title' in s ? s.title : undefined}>
        <span class="text-[12px] label-caps {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
        <span
          class="font-display font-bold leading-none tabular-nums {active
            ? 'text-[26px] @5xl:text-[34px] text-text'
            : 'text-[20px] @5xl:text-[24px] text-ink-2'}">{s.value}</span
        >
      </span>
    {/each}
    <LegPips total={p.firstTo} won={p.legsWon} {active} />
  </div>
</RowShell>
