<script lang="ts">
  // One number card (Stats.dc.html .kpi): label, the number with its unit and arrow, a line under
  // it, then a sparkline or a link (children).
  import type { Snippet } from 'svelte'
  import type { Trend } from '$lib/stats/trend'
  import TrendBadge from './TrendBadge.svelte'
  import Sparkline from './Sparkline.svelte'

  let {
    label,
    value,
    unit,
    trend = null,
    sub,
    spark,
    children,
  }: {
    label: string
    value: string
    unit?: string
    trend?: Trend | null
    sub?: string
    /** The trend line under the number, oldest first; drawn red when `trend` says worse. */
    spark?: number[]
    children?: Snippet
  } = $props()
</script>

<div class="card flex min-w-0 flex-col gap-1.5 px-[18px] py-4">
  <span class="text-[11px] label-caps text-text-dim">{label}</span>
  <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <span class="font-display text-[40px] font-bold leading-none">{value}</span>
    {#if unit}<span class="text-[14px] text-text-muted">{unit}</span>{/if}
    <TrendBadge {trend} />
  </div>
  {#if sub}<span class="text-[12px] text-text-muted">{sub}</span>{/if}
  {#if spark}<Sparkline values={spark} tone={trend !== null && !trend.good ? 'bad' : 'accent'} />{/if}
  {@render children?.()}
</div>
