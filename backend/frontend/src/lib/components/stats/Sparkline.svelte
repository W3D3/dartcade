<script lang="ts">
  // A KPI's 10-leg trend under its number (Stats.dc.html): lime, or red when the arrow is.
  import { sparkPoints } from '$lib/stats/view'

  let { values, bad = false }: { values: number[]; bad?: boolean } = $props()
  const W = 150
  const H = 34
</script>

{#if values.length > 1}
  <svg width={W} height={H} viewBox="0 0 {W} {H}" aria-hidden="true" class="block max-w-full">
    <polyline
      points={sparkPoints(values, W, H)}
      fill="none"
      class={bad ? 'stroke-live' : 'stroke-accent'}
      stroke-width="1.6"
      stroke-linejoin="round"
      stroke-linecap="round"
      opacity=".9"
    />
  </svg>
{/if}
