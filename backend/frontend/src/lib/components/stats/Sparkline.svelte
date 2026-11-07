<script lang="ts">
  // A small trend line under a stat tile's number (Stats.dc.html): lime, or red when the stat got
  // worse. Decorative: the tile's number and arrow say the same in words.
  import { Chart, Spline } from 'layerchart/svg'
  import { TONE_STROKE, type Tone } from '$lib/stats/tones'

  let { values, tone = 'accent' }: { values: number[]; tone?: Tone } = $props()
  const points = $derived(values.map((v, i) => ({ i, v })))
</script>

{#if values.length > 1}
  <div class="h-[34px] w-[150px] max-w-full" aria-hidden="true">
    <Chart
      ssr
      class="block h-full w-full"
      data={points}
      x="i"
      y="v"
      yNice={false}
      axis={false}
      grid={false}
      rule={false}
      tooltipContext={false}
      padding={{ top: 3, bottom: 3, left: 1, right: 1 }}
    >
      {#snippet marks()}
        <Spline class="fill-none {TONE_STROKE[tone]}" strokeWidth={1.6} />
      {/snippet}
    </Chart>
  </div>
{/if}
