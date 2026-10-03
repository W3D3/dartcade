<script lang="ts">
  import PanelShell from './PanelShell.svelte'
  import LegPips from './LegPips.svelte'
  import Chalkboard from './Chalkboard.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import type { PillKind } from './pills.js'
  import type { X01PlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'

  let { name, p, active, solo = false, pill, seat = null, chalkboard }: {
    name: string
    p: X01PlayerView
    active: boolean
    solo?: boolean
    pill: PillKind | null
    seat?: SeatLine | null
    chalkboard: boolean
  } = $props()
</script>

<PanelShell {name} {active} {solo} {pill} {seat} pillInRow={solo}>
  {#snippet aside()}
    {#if !solo}<LegPips total={p.firstTo} won={p.legsWon} {active} />{/if}
  {/snippet}

  <div class="flex flex-col gap-[6px]">
    {#if solo}<span class="text-[12px] uppercase tracking-[0.1em] text-text-muted">Left</span>{/if}
    <span class="font-display font-bold text-[min(220px,24vh)] leading-[0.8] tracking-[-0.02em] tabular-nums
                 {active ? 'text-text' : 'text-ink-3'}"><RollingNumber value={p.remaining} reset={p.leg}
                 bust={p.current?.bust ?? false} checkout={p.remaining === 0} /></span>
  </div>

  {#if !p.opened}
    <span class="text-[13px] uppercase tracking-[0.1em] text-text-muted">Needs to open</span>
  {:else if !active && p.canFinish}
    <span class="flex items-baseline gap-[10px]">
      <span class="text-[12px] uppercase tracking-[0.1em] text-text-dim">Can finish</span>
      <span class="font-display font-bold text-[28px] leading-none text-ink-3">{p.canFinish}</span>
    </span>
  {/if}

  <div class="flex gap-9">
    {#each [{ label: solo ? 'Leg avg' : 'Avg', value: solo ? p.legAvg : p.avg }, { label: 'Darts', value: String(p.darts) }] as s (s.label)}
      <span class="flex flex-col gap-1">
        <span class="text-[13px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
        <span class="font-display font-bold text-[44px] leading-none tabular-nums {active ? 'text-text' : 'text-ink-2'}">{s.value}</span>
      </span>
    {/each}
  </div>

  {#if chalkboard}<Chalkboard visits={p.visits} current={p.current} {active} />{/if}
</PanelShell>
