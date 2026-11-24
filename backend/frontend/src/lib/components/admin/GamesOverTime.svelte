<script lang="ts">
  // Games started per UTC day (the Activity page's Games played subpage): one line over the days, the
  // y axis from zero, a vertical rule at each labelled day, axis captions under and beside it.
  import { Chart, Spline, Tooltip } from 'layerchart/svg'
  import type { AnyScale, ChartState } from 'layerchart'
  import { chartGrid, integerTicks } from '$lib/charts/grid'
  import { dayLabel } from '$lib/admin/activityGames'

  type Row = { i: number; day: string; count: number }
  type State = ChartState<Row, AnyScale<number, number>, AnyScale<number, number>>

  let { perDay }: { perDay: { day: string; count: number }[] } = $props()

  const rows = $derived(perDay.map((d, i): Row => ({ i, ...d })))
  const peak = $derived(Math.max(1, ...perDay.map(d => d.count)))
  const xTicks = $derived(integerTicks(0, Math.max(0, perDay.length - 1), 8))
  const total = $derived(perDay.reduce((s, d) => s + d.count, 0))
</script>

<div class="flex flex-col gap-1">
  <span class="text-caption text-text-muted">Games started</span>
  <div class="h-[220px] w-full">
    <Chart
      ssr
      class="block size-full"
      role="img"
      aria-label="Games started per day, {perDay.length} days, {total} in total"
      data={rows}
      x="i"
      y="count"
      xDomain={[0, Math.max(1, perDay.length - 1)]}
      yDomain={[0, peak * 1.1]}
      padding={{ left: 36, right: 14, top: 12, bottom: 24 }}
      axis
      grid={chartGrid(xTicks, { class: 'stroke-surface-paused', strokeWidth: 1 })}
      rule={false}
      highlight={{ points: { r: 4, class: 'stroke-bg', strokeWidth: 2 }, lines: false }}
      tooltipContext={{ mode: 'quadtree' }}
      props={{
        xAxis: {
          ticks: xTicks,
          format: (n: number) => dayLabel(perDay[n]?.day ?? ''),
          tickMarks: false,
          classes: { tickLabel: 'fill-text-dim text-caption' },
        },
        yAxis: { ticks: 4, tickMarks: false, classes: { tickLabel: 'fill-text-dim text-caption' } },
      }}
    >
      {#snippet marks()}
        <Spline class="stroke-accent" strokeWidth={2.5} />
      {/snippet}
      {#snippet tooltip({ context }: { context: State })}
        <Tooltip.Root variant="none" {context}>
          {#snippet children({ data }: { data: Row })}
            <div class="chart-tooltip">{dayLabel(data.day)}: {data.count} {data.count === 1 ? 'game' : 'games'}</div>
          {/snippet}
        </Tooltip.Root>
      {/snippet}
    </Chart>
  </div>
  <span class="self-center text-caption text-text-muted">Day (UTC)</span>
</div>
