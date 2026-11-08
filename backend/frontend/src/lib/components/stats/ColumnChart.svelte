<script lang="ts">
  // Columns per category, one per series side by side (Stats.dc.html: what your visits score, now
  // against before). The first series' values are written over its columns. Hover or Left/Right
  // (with the chart focused) shows a category's numbers.
  // Low-level `Chart` + `Bars` with seriesLayout 'group', as the BarChart preset does it (the
  // presets recurse under SSR, see RaceChart).
  import { Bars, Chart, Text, Tooltip } from 'layerchart/svg'
  import type { ChartState } from 'layerchart'
  import { bandwidth, scaled } from '$lib/stats/chart'
  import { createChartNav } from '$lib/details/chartNav.svelte'
  import { TONE_VAR, type Tone } from '$lib/stats/tones'

  export type ColumnSeries = { key: string; label: string; tone: Tone; values: (number | null)[] }
  type Row = { category: string } & Record<string, number | string | null>
  type ColumnState = ChartState<Row>

  let {
    categories,
    series,
    format,
    label,
  }: {
    categories: string[]
    series: ColumnSeries[]
    /** A value as its label and axis tick ("24%"). */
    format: (value: number) => string
    /** What the chart shows, for screen readers. */
    label: string
  } = $props()

  const rows = $derived(
    categories.map((category, i): Row => ({ category, ...Object.fromEntries(series.map(s => [s.key, s.values[i] ?? null])) })),
  )
  const chartSeries = $derived(series.map(s => ({ key: s.key, label: s.label, color: TONE_VAR[s.tone] })))
  const lead = $derived(series[0]?.key ?? '')
  const value = (row: Row, key: string) => (typeof row[key] === 'number' ? row[key] : null)
  // Too narrow for the category names side by side: tilt them
  let width = $state(Infinity)
  const narrow = $derived(width < categories.length * 50)

  function describe(row: Row): string {
    const parts = series.map(s => {
      const v = value(row, s.key)
      return `${s.label} ${v === null ? '–' : format(v)}`
    })
    return `${row.category}: ${parts.join(', ')}`
  }
  let context = $state<ColumnState | undefined>()
  const nav = createChartNav(
    () => rows.map(point => ({ seriesKey: null, point })),
    describe,
    () => context,
  )
</script>

<div class="h-[220px] w-full sm:h-auto sm:aspect-440/210" bind:clientWidth={width}>
  <Chart
    ssr
    bind:context
    class="block size-full "
    role="img"
    aria-label={label}
    tabindex={0}
    onkeydown={nav.onkeydown}
    onblur={nav.blur}
    data={rows}
    x="category"
    series={chartSeries}
    seriesLayout="group"
    valueAxis="y"
    yDomain={[0, null]}
    bandPadding={0.28}
    groupPadding={0.08}
    padding={{ left: 36, right: 4, top: 18, bottom: narrow ? 40 : 22 }}
    axis
    grid={{ x: false, y: { class: 'stroke-surface-paused', strokeWidth: 1 } }}
    rule={false}
    tooltipContext={{ mode: 'band' }}
    props={{
      xAxis: {
        tickMarks: false,
        tickLabelProps: narrow ? { rotate: -40, textAnchor: 'end', verticalAnchor: 'middle' } : {},
        classes: { tickLabel: 'fill-text-dim text-[10px]' },
      },
      yAxis: { ticks: 4, format, tickMarks: false, classes: { tickLabel: 'fill-text-dim text-[10px]' } },
    }}
  >
    {#snippet marks({ context }: { context: ColumnState })}
      {#each context.series.visibleSeries as s (s.key)}
        <Bars seriesKey={s.key} x1={() => s.key} radius={2} rounded="top" fill={s.color} />
      {/each}
    {/snippet}
    {#snippet aboveMarks({ context }: { context: ColumnState })}
      {@const x1 = context.x1Scale}
      {#if x1}
        {#each rows as row (row.category)}
          {@const v = value(row, lead)}
          {#if v !== null && v > 0}
            <Text
              x={scaled(context.xScale, row.category) + scaled(x1, lead) + bandwidth(x1) / 2}
              y={scaled(context.yScale, v) - 5}
              value={format(v)}
              textAnchor="middle"
              class="fill-text text-[10px]"
            />
          {/if}
        {/each}
      {/if}
    {/snippet}
    {#snippet tooltip({ context }: { context: ColumnState })}
      <Tooltip.Root variant="none" {context}>
        {#snippet children({ data }: { data: Row })}
          <div class="chart-tooltip">{describe(data)}</div>
        {/snippet}
      </Tooltip.Root>
    {/snippet}
  </Chart>
</div>
<span class="sr-only" role="status" aria-live="polite">{nav.liveText}</span>
