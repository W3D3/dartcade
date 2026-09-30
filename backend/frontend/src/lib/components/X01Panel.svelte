<script lang="ts">
  import PanelShell from './PanelShell.svelte'
  import LegPips from './LegPips.svelte'
  import Chalkboard from './Chalkboard.svelte'
  import type { PillKind } from './PlayerPill.svelte'
  import type { X01PlayerView } from '$lib/playerStats.js'

  let { name, p, active, solo = false, pill, chalkboard }: {
    name: string
    p: X01PlayerView
    active: boolean
    solo?: boolean
    pill: PillKind | null
    chalkboard: boolean
  } = $props()
</script>

<PanelShell {name} {active} {solo} {pill} pillInRow={solo}>
  {#snippet aside()}
    {#if !solo}<LegPips total={p.firstTo} won={p.legsWon} {active} />{/if}
  {/snippet}

  <div class="flex flex-col gap-[6px]">
    {#if solo}<span class="text-[12px] uppercase tracking-[0.1em] text-text-muted">Left</span>{/if}
    <span class="font-display font-bold text-[min(220px,24vh)] leading-[0.8] tracking-[-0.02em] tabular-nums
                 {active ? 'text-text' : 'text-ink-3'}">{p.remaining}</span>
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
    {#each [{ label: solo ? 'Leg avg' : 'Avg', value: solo ? p.legAvg : p.avg }, { label: 'Darts', value: String(p.darts) }] as s}
      <span class="flex flex-col gap-1">
        <span class="text-[13px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
        <span class="font-display font-bold text-[44px] leading-none tabular-nums {active ? 'text-text' : 'text-ink-2'}">{s.value}</span>
      </span>
    {/each}
  </div>

  {#if chalkboard}<Chalkboard visits={p.visits} current={p.current} {active} />{/if}
</PanelShell>
