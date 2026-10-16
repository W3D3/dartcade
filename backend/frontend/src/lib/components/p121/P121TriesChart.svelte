<!--
  121's "Target per try" (P121-Summary): a dot per try at its target, lime when checked out, a red
  ring when missed, joined by a grey line so the climbs and drops read at a glance.
  Built from the low-level `Chart` + `Spline` like RaceChart (the LineChart preset recurses under SSR).
-->
<script lang="ts">
  import { Chart, Spline } from 'layerchart/svg'
  import type { ChartState, AnyScale } from 'layerchart'

  type Point = { n: number; target: number; made: boolean }
  type PointChartState = ChartState<Point, AnyScale<number, number>, AnyScale<number, number>>

  let { tries, missLabel }: { tries: { target: number; made: boolean }[]; missLabel: string } = $props()

  const points = $derived(tries.map((t, i) => ({ n: i + 1, ...t })))
  const low = $derived(Math.min(...tries.map(t => t.target)))
  const high = $derived(Math.max(low + 1, ...tries.map(t => t.target)))
  // About four gridlines whatever the spread
  const step = $derived(Math.max(1, Math.ceil((high - low) / 4)))
  const yTicks = $derived(Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, i) => low + i * step))
  // xDomain/yDomain leave room around the dots, so the end ones aren't clipped
  const made = $derived(tries.filter(t => t.made).length)
  const tickLabel = 'fill-text-dim font-mono text-[12px]'
</script>

<section
  aria-label="Target per try"
  class="flex flex-col gap-[10px] box-border px-[22px] py-5 rounded-2xl border border-line bg-surface-1 min-w-0"
>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
    <h2 class="m-0 text-[12px] font-semibold label-caps text-text-dim">Target per try</h2>
    <span class="md:ml-auto inline-flex items-center gap-[6px] text-[13px] text-text-muted"
      ><span class="size-[10px] rounded-full bg-accent"></span>Checked out</span
    >
    <span class="inline-flex items-center gap-[6px] text-[13px] text-text-muted"
      ><span class="size-[10px] rounded-full border-2 border-live box-border"></span>{missLabel}</span
    >
  </div>
  <!-- The height sits on a wrapper: the chart fills its parent -->
  <div class="h-[220px] md:h-[300px]">
    <Chart
      ssr
      class="block w-full h-full"
      role="img"
      aria-label="Target per try: highest {high}, {made} of {tries.length} checkouts made"
      data={points}
      x="n"
      y="target"
      xDomain={[0.5, tries.length + 0.5]}
      yDomain={[low - step / 4, high + step / 4]}
      xNice={false}
      yNice={false}
      padding={{ left: 40, right: 14, top: 14, bottom: 28 }}
      axis
      grid={{ x: false, y: { class: 'stroke-surface-paused', strokeWidth: 1 }, yTicks }}
      rule={false}
      props={{
        xAxis: { ticks: points.map(p => p.n), tickMarks: false, format: String, classes: { tickLabel } },
        yAxis: { ticks: yTicks, tickMarks: false, format: String, classes: { tickLabel } },
      }}
    >
      {#snippet marks()}
        <Spline class="stroke-line-strong fill-none" strokeWidth={2} />
      {/snippet}
      {#snippet aboveMarks({ context }: { context: PointChartState })}
        {#each points as p (p.n)}
          <circle
            cx={context.xScale(p.n)}
            cy={context.yScale(p.target)}
            r="7"
            stroke-width="2.5"
            class={p.made ? 'fill-accent stroke-accent' : 'fill-bg stroke-live'}
          />
        {/each}
      {/snippet}
    </Chart>
  </div>
</section>
