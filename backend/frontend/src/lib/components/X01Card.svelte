<script lang="ts">
  // An X01 player of three or more in the portrait layout: a compact card in a two-column grid above
  // the board (Match-Vertical-Party): name and leg pips, the score with the average and darts, the finish.
  import PanelShell from './PanelShell.svelte'
  import LegPips from './LegPips.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import { x01Roll } from '$lib/playerStats'
  import type { PillKind } from './pills.js'
  import type { X01PlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'

  let {
    name,
    bot = null,
    p,
    active,
    pill,
    seat = null,
  }: {
    name: string
    bot?: { level: number } | null
    p: X01PlayerView
    active: boolean
    pill: PillKind | null
    seat?: SeatLine | null
  } = $props()

  const stats = $derived([
    { label: 'Avg', value: p.avg },
    { label: 'Darts', value: String(p.darts) },
  ])
</script>

<PanelShell {name} {bot} {active} portrait {pill} {seat} pillInRow>
  {#snippet aside()}
    {#if p.firstTo > 1}<LegPips total={p.firstTo} won={p.legsWon} {active} />{/if}
  {/snippet}

  <div class="flex items-end justify-between gap-3 min-w-0">
    <span
      class="font-display font-bold text-[min(30cqi,9vh)] leading-[0.82] tracking-[-0.02em] tabular-nums {active
        ? 'text-text'
        : 'text-ink-3'}"><RollingNumber {...x01Roll(p)} /></span
    >
    <span class="flex gap-4 lg:gap-[18px] pb-1">
      {#each stats as s (s.label)}
        <span class="flex flex-col gap-[3px]">
          <span class="text-[10px] label-caps {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
          <span class="font-display font-bold text-[24px] lg:text-[32px] leading-none tabular-nums {active ? 'text-text' : 'text-ink-2'}"
            >{s.value}</span
          >
        </span>
      {/each}
    </span>
  </div>

  {#if !p.opened}
    <span class="text-[13px] label-caps text-text-muted">Needs to open</span>
  {:else if p.showFinish}
    {#if p.canFinish}
      <span class="flex items-baseline gap-[10px] min-w-0">
        <span class="text-[11px] lg:text-[13px] label-caps text-text-muted whitespace-nowrap">Can finish</span>
        <span class="font-display font-bold text-[24px] lg:text-[34px] leading-none truncate {active ? 'text-accent' : 'text-ink-3'}"
          >{p.canFinish}</span
        >
      </span>
    {:else}
      <span class="text-[13px] lg:text-[15px] text-text-dim">No finish yet</span>
    {/if}
  {/if}
</PanelShell>
