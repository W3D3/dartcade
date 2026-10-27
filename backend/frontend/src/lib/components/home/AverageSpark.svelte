<script lang="ts">
  // Average per day (Home board, under the form tiles): the 3-dart average of each day with an
  // X01 game in the last 30 days (UTC days, from the stats), a lime line over a fading fill, a dot on the latest day.
  // Low-level `Chart` + `Area` + `Spline`, like the other charts (the presets recurse under SSR).
  import { Area, Chart, Spline } from 'layerchart/svg'
  import type { ChartState, AnyScale } from 'layerchart'

  type Point = { day: number; avg: number }
  type PointChartState = ChartState<Point, AnyScale<number, number>, AnyScale<number, number>>

  let { days: points }: { days: Point[] } = $props()

  const last = $derived(points[points.length - 1])
  const low = $derived(Math.min(...points.map(p => p.avg)))
  const high = $derived(Math.max(low + 1, ...points.map(p => p.avg)))
</script>

{#if points.length > 1}
  <div class="flex flex-col gap-[6px]">
    <div class="flex justify-between text-[12px] text-text-muted">
      <span>Average per day</span>
      <span class="font-mono">latest {last.avg.toFixed(1)}</span>
    </div>
    <div class="h-[74px]">
      <Chart
        ssr
        class="block h-full w-full"
        role="img"
        aria-label="3-dart average per day, from {points[0].avg.toFixed(0)} to {last.avg.toFixed(0)}"
        data={points}
        x="day"
        y="avg"
        yDomain={[low - (high - low) * 0.15, high + (high - low) * 0.15]}
        yNice={false}
        axis={false}
        grid={false}
        rule={false}
        padding={{ left: 6, right: 6, top: 6, bottom: 4 }}
      >
        {#snippet marks()}
          <Area line={false} class="fill-accent/20" />
          <Spline class="fill-none stroke-accent" strokeWidth={2.5} />
        {/snippet}
        {#snippet aboveMarks({ context }: { context: PointChartState })}
          <circle
            cx={context.xScale(last.day)}
            cy={context.yScale(last.avg)}
            r="4.5"
            class="fill-accent stroke-surface-1"
            stroke-width="2"
          />
        {/snippet}
      </Chart>
    </div>
  </div>
{/if}
