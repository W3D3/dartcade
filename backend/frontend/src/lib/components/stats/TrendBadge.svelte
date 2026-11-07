<script lang="ts">
  // The arrow a stat carries against an earlier value (Stats.dc.html .dl): lime when it got
  // better, red when worse; nothing without one.
  import type { Trend } from '$lib/stats/trend'

  let { trend }: { trend: Trend | null } = $props()
</script>

{#if trend}
  <span
    class="whitespace-nowrap rounded-full px-[7px] py-0.5 text-[12px] font-semibold {trend.good
      ? 'bg-accent/10 text-accent'
      : 'bg-live/12 text-live'}"
    aria-label="{trend.good ? 'Better' : 'Worse'} than before: {trend.text.slice(2)}">{trend.text}</span
  >
{/if}
