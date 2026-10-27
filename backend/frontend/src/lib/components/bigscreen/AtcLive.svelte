<script lang="ts">
  // Around the Clock on the big screen (Presenter-ATC-Landscape, -Portrait): each seat's target and progress strip, then the open visit.
  import type { Snapshot } from '$lib/ws'
  import type { Orientation } from '$lib/bigscreen/stage'
  import { atcLive, type AtcLiveSeat } from '$lib/bigscreen/atcView'
  import { pillKind, rowScale } from '$lib/bigscreen/rowScale'
  import { NUM, type LiveSizes } from '$lib/bigscreen/look'
  import LiveFrame from './LiveFrame.svelte'
  import SeatHead from './SeatHead.svelte'
  import SeatShell from './SeatShell.svelte'
  import Seats from './Seats.svelte'
  import Stat from './Stat.svelte'
  import StatusPill from './StatusPill.svelte'
  import VisitRow from './VisitRow.svelte'

  let { snapshot, orientation }: { snapshot: Snapshot; orientation: Orientation } = $props()
  const v = $derived(atcLive(snapshot))
  const rs = $derived(rowScale(v.seats.length))

  const cell = (c: AtcLiveSeat['cells'][number], on: boolean) =>
    c.state === 'hit'
      ? on
        ? 'bg-accent text-accent-fg'
        : 'bg-pip-dim text-accent-fg'
      : c.state === 'current'
        ? on
          ? 'border-[3px] border-accent text-text'
          : 'border-[3px] border-text-dim text-text'
        : 'bg-surface-chip text-pip-dim'
</script>

{#snippet strip(s: AtcLiveSeat, h: number, cols: number)}
  <div class="grid gap-2" style="grid-template-columns:repeat({cols},minmax(0,1fr))">
    {#each s.cells as c, i (i)}
      <span
        class="box-border flex items-center justify-center rounded-[10px] font-display text-[26px] font-bold {cell(c, s.throwing)}"
        style="height:{h}px">{c.short}</span
      >
    {/each}
  </div>
{/snippet}

{#snippet card(s: AtcLiveSeat)}
  <SeatShell active={s.throwing} variant="card" label="{s.name}: target {s.target}">
    <SeatHead name={s.name} active={s.throwing} />
    <div class="h-[46px]"><StatusPill kind={pillKind(s)} /></div>
    <div class="flex items-end justify-between gap-5">
      <Stat label="TARGET" value={s.target} size={250} leading={0.82} gap={0} tone={s.throwing ? 'text-text' : 'text-ink-2'} />
      <span class="flex flex-col items-end gap-3.5 pb-1.5">
        <Stat label="HIT RATE" value={s.hitRate} right />
        <Stat label="DARTS" value={s.darts} right />
      </span>
    </div>
    <div class="flex flex-col gap-2.5">
      <span class="text-[28px] font-bold text-ink-2">{s.doneText}</span>
      {@render strip(s, 52, 7)}
    </div>
  </SeatShell>
{/snippet}

{#snippet row(s: AtcLiveSeat)}
  <SeatShell active={s.throwing} variant="row" label="{s.name}: target {s.target}">
    <SeatHead name={s.name} active={s.throwing} scale={rs}>
      <StatusPill kind={pillKind(s)} />
      <span class="font-bold text-ink-2" style="font-size:{rs.detail}px">{s.doneText}</span>
      <span class="w-[110px] text-right text-text-dim" style="font-size:{rs.detail}px">{s.hitRate}</span>
      <span class="{NUM} w-[110px] text-right leading-none {s.throwing ? 'text-text' : 'text-ink-3'}" style="font-size:{rs.num}px"
        >{s.target}</span
      >
    </SeatHead>
    {@render strip(s, rs.strip, 21)}
  </SeatShell>
{/snippet}

<LiveFrame board={v.board} header={v.header} {orientation}>
  {#snippet panel(sz: LiveSizes)}
    <Seats seats={v.seats} party={v.party} portrait={sz.portrait} cardsHeight={820} {card} {row} />
    <VisitRow total={v.visit.total} tiles={v.slots} {...sz.visit} />
  {/snippet}
</LiveFrame>
