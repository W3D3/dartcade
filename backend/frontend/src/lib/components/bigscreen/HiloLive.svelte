<script lang="ts">
  // Higher Lower on the big screen (Presenter-HiLo-Landscape, -Portrait): lives, the bars to beat, the open visit.
  import type { Snapshot } from '$lib/ws'
  import type { Orientation } from '$lib/bigscreen/stage'
  import { hiloLive, type HiloLiveSeat } from '$lib/bigscreen/hiloView'
  import { pillKind, rowScale } from '$lib/bigscreen/rowScale'
  import { LABEL, NUM, type LiveSizes } from '$lib/bigscreen/look'
  import Hearts from '$lib/components/hilo/Hearts.svelte'
  import LiveFrame from './LiveFrame.svelte'
  import SeatHead from './SeatHead.svelte'
  import SeatShell from './SeatShell.svelte'
  import Seats from './Seats.svelte'
  import Stat from './Stat.svelte'
  import StatusPill from './StatusPill.svelte'
  import VisitRow from './VisitRow.svelte'

  let { snapshot, orientation }: { snapshot: Snapshot; orientation: Orientation } = $props()
  const v = $derived(hiloLive(snapshot))
  const rs = $derived(rowScale(v.seats.length))

  // The scale runs 0 to 180, the most three darts can score
  const MAX = 180
  const frac = (n: number) => (Math.min(Math.max(n, 0), MAX) / MAX) * 100
  const pct = (n: number) => `${frac(n)}%`
  // The marker's number stays this far (points) from the ends so its label fits
  const EDGE = 8
</script>

{#snippet pill(s: HiloLiveSeat)}
  <StatusPill kind={pillKind(s)} text={v.bullOff && pillKind(s) === 'throwing' ? 'BULL OFF' : undefined} />
{/snippet}

{#snippet card(s: HiloLiveSeat)}
  <SeatShell active={s.throwing} variant="card" label="{s.name}: {s.livesText}">
    <SeatHead name={s.name} active={s.throwing} />
    <div class="h-[46px]">{@render pill(s)}</div>
    <div class="flex items-center gap-2.5">
      <Hearts lives={s.lives} total={s.total} size="size-[44px]" tone={s.throwing ? 'accent' : 'muted'} />
      <span class="ml-2.5 text-[28px] text-ink-2">{s.livesText}</span>
    </div>
    <div class="flex items-end justify-between">
      <Stat
        label="LAST VISIT"
        value={s.last?.total ?? '–'}
        size={130}
        leading={0.85}
        gap={0}
        tone={s.throwing ? 'text-text' : 'text-ink-2'}
      />
      {#if s.last}
        <span class="pb-2.5 text-[28px] font-bold {s.last.lost ? 'text-live' : 'text-accent'}">{s.last.effect}</span>
      {/if}
    </div>
  </SeatShell>
{/snippet}

{#snippet row(s: HiloLiveSeat)}
  <SeatShell active={s.throwing} variant="row" label="{s.name}: {s.livesText}">
    <SeatHead name={s.name} active={s.throwing} scale={rs}>
      {@render pill(s)}
      <Hearts lives={s.lives} total={s.total} size={rs.heartClass} tone={s.throwing ? 'accent' : 'muted'} />
      <span class="w-[220px]" style="font-size:{rs.effect}px">{s.livesText}</span>
      {#if s.last}
        <span class="{NUM} w-[110px] text-right leading-none" style="font-size:{rs.lastNum}px">{s.last.total}</span>
        <span class="w-[150px] font-bold {s.last.lost ? 'text-live' : 'text-accent'}" style="font-size:{rs.effect}px">{s.last.effect}</span>
      {/if}
    </SeatHead>
  </SeatShell>
{/snippet}

{#snippet needs()}
  {#if !v.bullOff}
    <div
      class="box-border flex h-[270px] flex-none flex-col justify-between rounded-[28px] border-2 border-line bg-surface-1 px-[34px] py-7"
    >
      <div class="flex items-baseline gap-[22px]">
        <span class={LABEL}>NEEDS</span>
        <span class="{NUM} whitespace-nowrap text-[64px] leading-none"
          >OVER <span class="text-accent">{v.high}</span> <span class="text-pip-dim">or</span> UNDER
          <span class="text-ice">{v.low}</span></span
        >
      </div>
      <div class="relative h-[130px]" role="img" aria-label="Scale from 0 to {MAX}, LOW {v.low}, HIGH {v.high}">
        <span class="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[24px] font-bold text-ice" style="left:{pct(v.low)}"
          >LOW {v.low}</span
        >
        <span class="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[24px] font-bold text-accent" style="left:{pct(v.high)}"
          >HIGH {v.high}</span
        >
        <div class="absolute inset-x-0 top-[34px] flex h-9 overflow-hidden rounded-[10px]">
          <div class="bg-[#1f3a52]" style="flex-basis:{pct(v.low)}"></div>
          <div class="flex flex-1 items-center justify-center bg-live-soft text-[22px] font-extrabold tracking-[0.1em] text-live">
            −1 LIFE
          </div>
          <div
            class="flex items-center justify-center bg-[#2a3a12] text-[22px] font-extrabold tracking-[0.1em] text-accent"
            style="flex-basis:{100 - frac(v.high)}%"
          >
            NEW HIGH
          </div>
        </div>
        {#if v.marker}
          <span
            class="absolute top-7 h-12 w-[5px] -translate-x-1/2 rounded-full {v.marker.lost ? 'bg-live' : 'bg-text'}"
            style="left:{pct(v.marker.total)}"
          ></span>
          <span
            class="{NUM} absolute top-[84px] -translate-x-1/2 rounded-lg px-3 text-[34px] leading-[1.2] {v.marker.lost
              ? 'bg-live text-bg'
              : 'bg-text text-bg'}"
            style="left:{pct(Math.min(Math.max(v.marker.total, EDGE), MAX - EDGE))}">{v.marker.total}</span
          >
        {/if}
        <span class="absolute bottom-0 left-1 text-[20px] text-text-dim">0</span>
        <span class="absolute bottom-0 right-1 text-[20px] text-text-dim">{MAX}</span>
      </div>
    </div>
  {/if}
{/snippet}

<LiveFrame board={v.board} header={v.header} {orientation} boardWidth={780}>
  {#snippet panel(sz: LiveSizes)}
    <Seats seats={v.seats} party={v.party} portrait={sz.portrait} cardsHeight={520} {card} {row} />
    {@render needs()}
    <VisitRow total={v.visit.total} tiles={v.slots} bullOff={v.bullOff} {...sz.compact} />
  {/snippet}
</LiveFrame>
