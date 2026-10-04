<script lang="ts">
  import AtcProgress from './AtcProgress.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import SeatBoardLine from './SeatBoardLine.svelte'
  import type { PillKind } from './pills.js'
  import type { AtcPlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'

  let { name, p, active, pill, seat = null }: { name: string; p: AtcPlayerView; active: boolean; pill: PillKind | null; seat?: SeatLine | null } = $props()
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

<!-- Tablets, by the row's own width: from 672 px three columns; 512 to 672 px narrower ones with
     the strip in two rows; below 512 px name, target and progress stacked -->
<div class="@container h-full min-h-0">
<section aria-label="{name}, {active ? 'throwing' : 'waiting'}"
  class="h-full min-h-0 box-border rounded-[16px] px-[18px] py-4 gap-4 xl:px-6 xl:py-5 xl:gap-5 grid items-center max-xl:content-center overflow-hidden
         grid-cols-[190px_120px_minmax(0,1fr)] max-xl:@lg:@max-2xl:grid-cols-[140px_100px_minmax(0,1fr)] max-xl:@lg:@max-2xl:gap-3
         xl:grid-cols-[210px_150px_minmax(0,1fr)] @max-lg:grid-cols-1 @max-lg:gap-3
         {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-panel border border-line-2'}">
  <div class="flex flex-col gap-[10px] min-w-0">
    <span class="flex items-center gap-[10px] xl:gap-3 min-w-0">
      <span class="w-[34px] h-[34px] text-[14px] xl:w-10 xl:h-10 xl:text-[17px] shrink-0 rounded-full flex items-center justify-center font-bold
                   {active ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}">{initial}</span>
      {#if seat}
        <span class="flex flex-col gap-[2px] min-w-0">
          <span class="text-[18px] xl:text-[21px] leading-[1.1] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}{#if seat.you}<span class="text-[13px] font-medium text-accent"> · you</span>{/if}</span>
          <SeatBoardLine line={seat} />
        </span>
      {:else}
        <span class="text-[18px] xl:text-[21px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
      {/if}
    </span>
    {#if pill}<PlayerPill kind={pill} small />{/if}
  </div>

  <span class="flex flex-col gap-1">
    <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">Target</span>
    <span class="font-display font-bold text-[min(104px,11vh)] leading-[0.85] {active ? 'text-accent' : 'text-ink-3'}"><RollingNumber value={p.target} normal="up" progress={p.done} /></span>
  </span>

  <div class="flex flex-col gap-3 min-w-0">
    <AtcProgress cells={p.cells} {active} layout="strip" cellHeight={32} class="max-xl:@lg:@max-2xl:grid-cols-[repeat(11,minmax(0,1fr))]!" />
    <span class="flex flex-wrap gap-x-4 gap-y-1 xl:gap-6 text-[13px] xl:text-[14px] {active ? 'text-text-muted' : 'text-text-dim'}">
      <span>Darts <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.darts}</strong></span>
      <span>Hit rate <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.hitRate}</strong></span>
      <span><strong class="{active ? 'text-text' : 'text-ink-2'}">{p.done}</strong> of {p.total} done</span>
    </span>
  </div>
</section>
</div>
