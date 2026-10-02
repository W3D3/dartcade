<script lang="ts">
  // The Around the Clock thrower on a phone: name, board, pill, the current target, progress, darts and hit rate.
  import AtcProgress from './AtcProgress.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import SeatBoardLine from './SeatBoardLine.svelte'
  import type { PillKind } from './pills.js'
  import type { AtcPlayerView } from '$lib/playerStats'
  import type { SeatLine } from '$lib/remote'

  let { name, p, pill, seat }: { name: string; p: AtcPlayerView; pill: PillKind | null; seat: SeatLine | null } = $props()

  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

<section aria-label="{name}, throwing, target {p.target}"
  class="shrink-0 box-border px-[14px] pt-3 pb-[14px] rounded-[16px] bg-surface-active border-2 border-accent flex flex-col gap-[10px]">
  <div class="flex items-center gap-2 min-w-0">
    <span class="w-[30px] h-[30px] shrink-0 rounded-full flex items-center justify-center font-bold text-[13px] bg-accent text-accent-fg">{initial}</span>
    <span class="flex flex-col gap-[1px] min-w-0">
      <span class="text-[16px] font-semibold leading-[1.1] truncate">{name}{#if seat?.you}<span class="text-[12px] font-medium text-accent"> · you</span>{/if}</span>
      {#if seat}<SeatBoardLine line={seat} size="sm" />{/if}
    </span>
    {#if pill}<PlayerPill kind={pill} small />{/if}
  </div>
  <div class="flex items-end justify-between gap-3">
    <span class="flex flex-col gap-1">
      <span class="text-[10px] uppercase tracking-[0.1em] text-text-muted">Target</span>
      <span class="font-display font-bold text-[64px] [@media(min-height:741px)]:text-[96px] leading-[0.8] text-accent">{p.target}</span>
    </span>
    <span class="flex flex-col items-end gap-1 text-[13px] text-text-muted">
      <span><strong class="text-text">{p.done}</strong> of {p.total} done</span>
      <span>Darts <strong class="text-text">{p.darts}</strong> · Hit rate <strong class="text-text">{p.hitRate}</strong></span>
    </span>
  </div>
  <AtcProgress cells={p.cells} active layout="strip" />
</section>
