<script lang="ts">
  import LegPips from './LegPips.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import type { PillKind } from './pills.js'
  import type { X01PlayerView } from '$lib/playerStats.js'

  let { name, p, active, pill }: { name: string; p: X01PlayerView; active: boolean; pill: PillKind | null } = $props()
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

<section aria-label="{name}, {active ? 'throwing' : 'waiting'}"
  class="h-full min-h-0 box-border rounded-[16px] px-6 grid grid-cols-[200px_170px_minmax(0,1fr)] items-center gap-5 overflow-hidden
         {active ? 'py-5 bg-surface-active border-2 border-accent' : 'py-4 bg-surface-panel border border-line-2'}">
  <div class="flex flex-col gap-[10px] min-w-0">
    <span class="flex items-center gap-3 min-w-0">
      <span class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-[17px]
                   {active ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}">{initial}</span>
      <span class="text-[21px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
    </span>
    {#if pill}<PlayerPill kind={pill} small />{/if}
  </div>

  <span class="font-display font-bold leading-[0.85] tabular-nums
               {active ? 'text-[min(120px,13vh)] text-text' : 'text-[min(88px,9vh)] text-ink-3'}">{p.remaining}</span>

  <div class="grid grid-cols-[minmax(0,1fr)_90px_90px_auto] items-center gap-5 min-w-0">
    {#if p.showFinish}
    <span class="flex flex-col gap-1 min-w-0">
      <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">Can finish</span>
      {#if !p.opened}
        <span class="text-[14px] text-text-dim">Needs to open</span>
      {:else if p.canFinish}
        <span class="font-display font-bold leading-none whitespace-nowrap truncate
                     {active ? 'text-[34px] text-accent' : 'text-[24px] text-ink-3'}">{p.canFinish}</span>
      {:else}
        <span class="text-[14px] text-text-dim">No finish yet</span>
      {/if}
    </span>
    {:else}
      <span></span>
    {/if}
    {#each [{ label: 'Last', value: p.last }, { label: 'Avg', value: p.avg }] as s (s.label)}
      <span class="flex flex-col gap-1">
        <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
        <span class="font-display font-bold leading-none tabular-nums {active ? 'text-[34px] text-text' : 'text-[24px] text-ink-2'}">{s.value}</span>
      </span>
    {/each}
    <LegPips total={p.firstTo} won={p.legsWon} {active} />
  </div>
</section>
