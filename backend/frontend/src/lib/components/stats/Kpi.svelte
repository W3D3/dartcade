<script lang="ts">
  // One number card of the Stats page (Stats.dc.html .kpi): label, the number with its unit and
  // arrow, a line under it, then a sparkline or a link.
  import type { Snippet } from 'svelte'
  import type { Delta } from '$lib/stats/view'
  import DeltaPill from './DeltaPill.svelte'
  import Sparkline from './Sparkline.svelte'

  let {
    label,
    value,
    unit,
    delta = null,
    sub,
    spark,
    children,
  }: {
    label: string
    value: string
    unit?: string
    delta?: Delta | null
    sub?: string
    spark?: number[]
    /** Under the line: a link ("View all"). */
    children?: Snippet
  } = $props()
</script>

<div class="card flex min-w-0 flex-col gap-1.5 px-[18px] py-4">
  <span class="text-[11px] label-caps text-text-dim">{label}</span>
  <div class="flex flex-wrap items-baseline gap-2">
    <span class="font-display text-[40px] font-bold leading-none">{value}</span>
    {#if unit}<span class="text-[14px] text-text-muted">{unit}</span>{/if}
    <DeltaPill {delta} />
  </div>
  {#if sub}<span class="text-[12px] text-text-muted">{sub}</span>{/if}
  {#if spark}<Sparkline values={spark} bad={delta !== null && !delta.good} />{/if}
  {@render children?.()}
</div>
