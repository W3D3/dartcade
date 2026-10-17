<!--
  Higher Lower's 0–180 scale (HiLo-Duel, -LifeLost, -Phone): the safe zones lit, the danger zone
  between the bars dark red, both bars with their numbers, and a marker for the visit total, lime
  when safe and red in danger. A visit that just lost a life shows as a solid red marker.
  Vertical beside the board on desktop, horizontal on phones.
-->
<script lang="ts">
  import type { HiloGame } from '$lib/api/game-ws'
  import { zoneOf } from '$lib/hilo/view'

  let {
    game,
    marker,
    orientation,
  }: {
    game: HiloGame
    /**
     * The open visit's total (`open`), or the visit that just lost a life; `lost` for a life lost
     * (a finished visit, or the open one locked by a miss). Null for none.
     */
    marker: { total: number; lost?: boolean; open?: boolean } | null
    orientation: 'vertical' | 'horizontal'
  } = $props()

  const pct = (n: number) => (n / 180) * 100
  const hp = $derived(pct(game.high))
  const lp = $derived(pct(game.low))
  const zone = $derived(marker && (marker.lost ? 'danger' : zoneOf(marker.total, game)))
  const mp = $derived(marker ? pct(marker.total) : 0)
  const WHERE = { 'safe-high': 'above the HIGH bar', 'safe-low': 'below the LOW bar', danger: 'between the bars' } as const
  const SHORT = { 'safe-high': 'above HIGH', 'safe-low': 'below LOW', danger: 'between the bars' } as const
  const label = $derived(
    `Scale from 0 to 180. HIGH bar at ${game.high}, LOW bar at ${game.low}.` +
      (marker && zone
        ? !marker.open
          ? ` The last visit of ${marker.total} lost a life.`
          : marker.lost
            ? ` This visit is ${marker.total}, missed the board, a life lost.`
            : ` This visit is ${marker.total}, ${WHERE[zone]}.`
        : ''),
  )
  const danger = $derived(
    marker?.lost ? 'bg-[#4a1c18] shadow-[inset_0_0_0_2px_var(--color-live)]' : 'bg-[#2a1412] shadow-[inset_0_0_0_2px_#6b2a24]',
  )
  const markerBox = $derived(
    marker?.lost
      ? 'bg-live text-bg border-0'
      : zone === 'danger'
        ? 'bg-[#24120f] border-[1.5px] border-live text-live'
        : 'bg-surface-active border-[1.5px] border-accent text-accent',
  )
  const markerNote = $derived(marker?.lost ? 'text-bg font-semibold' : zone === 'danger' ? 'text-[#ffb4ad]' : 'text-ink-2')
  // The same words on both scales: a finished visit lost a life, or this visit and where it stands
  const note = $derived(
    !marker || !zone ? '' : !marker.open ? 'lost a life' : marker.lost ? 'this visit · missed' : `this visit · ${SHORT[zone]}`,
  )
  const markerLine = $derived(zone === 'danger' ? 'bg-live' : 'bg-accent')
</script>

{#if orientation === 'vertical'}
  <div role="img" aria-label={label} class="relative h-full w-[150px] xl:w-[290px] shrink-0">
    <div class="absolute inset-x-0 top-[10px] bottom-[10px]">
      <span class="absolute top-[-6px] left-[26px] xl:left-[84px] w-9 text-right font-mono text-[12px] text-text-dim">180</span>
      <span class="absolute bottom-[-6px] left-[26px] xl:left-[84px] w-9 text-right font-mono text-[12px] text-text-dim">0</span>
      <div class="absolute inset-y-0 left-[66px] xl:left-[128px] w-6 xl:w-10 rounded-[8px] xl:rounded-[10px] overflow-hidden flex flex-col">
        <div class="bg-accent-line" style:flex-basis="{100 - hp}%"></div>
        <div class={danger} style:flex-basis="{hp - lp}%"></div>
        <div class="flex-1 bg-accent-line"></div>
      </div>
      {#each [hp, lp] as p (p)}
        <span class="absolute left-[60px] xl:left-[120px] w-9 xl:w-14 h-1 rounded-[2px] bg-accent translate-y-1/2" style:bottom="{p}%"
        ></span>
      {/each}
      <div class="absolute left-[100px] xl:left-[184px] flex flex-col" style:bottom="min(calc({hp}% + 6px), calc(100% - 56px))">
        <span class="text-[13px] font-bold label-caps text-accent">High</span>
        <span class="font-display font-bold text-[32px] xl:text-[52px] leading-[0.9]">{game.high}</span>
      </div>
      {#if hp - lp >= 25}
        <span
          class="hidden xl:block absolute left-[184px] translate-y-1/2 text-[13px] leading-[1.3] text-live-text"
          style:bottom="{(hp + lp) / 2}%">In between<br />−1 life</span
        >
      {/if}
      <div class="absolute left-[100px] xl:left-[184px] flex flex-col" style:top="min(calc({100 - lp}% + 6px), calc(100% - 56px))">
        <span class="font-display font-bold text-[32px] xl:text-[52px] leading-[0.9]">{game.low}</span>
        <span class="text-[13px] font-bold label-caps text-accent">Low</span>
      </div>
      {#if marker}
        <span class="absolute left-[54px] xl:left-[114px] w-[42px] xl:w-[62px] h-[3px] translate-y-1/2 {markerLine}" style:bottom="{mp}%"
        ></span>
        <div
          class="absolute left-0 w-14 xl:w-[116px] h-10 box-border px-2 xl:px-[10px] rounded-[10px] flex items-center gap-[6px] translate-y-1/2 {markerBox}"
          style:bottom="{mp}%"
        >
          <span class="font-display font-bold text-[24px] xl:text-[30px] leading-none">{marker.total}</span>
          <span class="hidden xl:inline text-[12px] whitespace-nowrap {markerNote}">· {marker.open ? 'this visit' : 'lost a life'}</span>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div role="img" aria-label={label} class="relative shrink-0 h-[104px]">
    <div class="absolute top-0 flex items-baseline gap-1" style:right="min(calc({100 - lp}% + 4px), calc(100% - 76px))">
      <span class="text-[10px] font-bold label-caps text-accent">Low</span>
      <span class="font-display font-bold text-[28px] leading-none">{game.low}</span>
    </div>
    <div class="absolute top-0 flex items-baseline gap-1" style:left="min(calc({hp}% + 4px), calc(100% - 80px))">
      <span class="text-[10px] font-bold label-caps text-accent">High</span>
      <span class="font-display font-bold text-[28px] leading-none">{game.high}</span>
    </div>
    <div class="absolute top-[38px] inset-x-0 h-7 rounded-[8px] overflow-hidden flex">
      <div class="bg-accent-line" style:flex-basis="{lp}%"></div>
      <div class={danger} style:flex-basis="{hp - lp}%"></div>
      <div class="flex-1 bg-accent-line"></div>
      <span class="absolute left-1 top-1/2 -translate-y-1/2 font-mono text-[10px] text-accent">0</span>
      <span class="absolute right-[6px] top-1/2 -translate-y-1/2 font-mono text-[10px] text-accent">180</span>
    </div>
    {#each [hp, lp] as p (p)}
      <span class="absolute top-8 w-1 h-10 rounded-[2px] bg-accent -translate-x-1/2" style:left="{p}%"></span>
    {/each}
    {#if marker && zone}
      <span class="absolute top-[34px] w-[3px] h-10 -translate-x-1/2 {markerLine}" style:left="{mp}%"></span>
      <div class="absolute top-[76px] left-0 h-7 box-border px-[10px] rounded-[8px] flex items-center gap-[6px] {markerBox}">
        <span class="font-display font-bold text-[22px] leading-none">{marker.total}</span>
        <span class="text-[12px] whitespace-nowrap {markerNote}">· {note}</span>
      </div>
    {/if}
  </div>
{/if}
