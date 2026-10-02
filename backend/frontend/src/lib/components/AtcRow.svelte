<script lang="ts">
  import AtcProgress from './AtcProgress.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import SeatBoardLine from './SeatBoardLine.svelte'
  import type { PillKind } from './pills.js'
  import type { AtcPlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'

  let { name, p, active, pill, seat = null }: { name: string; p: AtcPlayerView; active: boolean; pill: PillKind | null; seat?: SeatLine | null } = $props()
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

<section aria-label="{name}, {active ? 'throwing' : 'waiting'}"
  class="h-full min-h-0 box-border rounded-[16px] px-6 py-5 grid grid-cols-[210px_150px_minmax(0,1fr)] items-center gap-5 overflow-hidden
         {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-panel border border-line-2'}">
  <div class="flex flex-col gap-[10px] min-w-0">
    <span class="flex items-center gap-3 min-w-0">
      <span class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-[17px]
                   {active ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}">{initial}</span>
      {#if seat}
        <span class="flex flex-col gap-[2px] min-w-0">
          <span class="text-[21px] leading-[1.1] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}{#if seat.you}<span class="text-[13px] font-medium text-accent"> · you</span>{/if}</span>
          <SeatBoardLine line={seat} />
        </span>
      {:else}
        <span class="text-[21px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
      {/if}
    </span>
    {#if pill}<PlayerPill kind={pill} small />{/if}
  </div>

  <span class="flex flex-col gap-1">
    <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">Target</span>
    <span class="font-display font-bold text-[min(104px,11vh)] leading-[0.85] {active ? 'text-accent' : 'text-ink-3'}">{p.target}</span>
  </span>

  <div class="flex flex-col gap-3 min-w-0">
    <AtcProgress cells={p.cells} {active} layout="strip" cellHeight={32} />
    <span class="flex gap-6 text-[14px] {active ? 'text-text-muted' : 'text-text-dim'}">
      <span>Darts <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.darts}</strong></span>
      <span>Hit rate <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.hitRate}</strong></span>
      <span><strong class="{active ? 'text-text' : 'text-ink-2'}">{p.done}</strong> of {p.total} done</span>
    </span>
  </div>
</section>
