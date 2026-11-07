<script lang="ts">
  // Lines over numbered steps (Stats.dc.html: average by visit): the first series solid with a dot
  // and its value at each step, the others dashed; an optional band shades a stretch of steps
  // ("First 9"). Hover or Left/Right (with the chart focused) shows a step's numbers.
  import { Chart, Spline, Text, Tooltip } from 'layerchart/svg'
  import type { AnyScale, ChartState } from 'layerchart'
  import { createChartNav } from '$lib/details/chartNav.svelte'
  import { scaled } from '$lib/stats/chart'
  import { TONE_FILL, TONE_VAR, type Tone } from '$lib/stats/tones'

  export type LineSeries = { key: string; label: string; tone: Tone; values: (number | null)[] }
  type Row = { step: number } & Record<string, number | null>
  type LineState = ChartState<Row, AnyScale<number, number>, AnyScale<number, number>>

  let {
    steps,
    series,
    format,
    label,
    stepLabel = (n: number) => String(n),
    band,
  }: {
    /** The x positions, in order ("1" to "7"). */
    steps: number[]
    series: LineSeries[]
    format: (value: number) => string
    label: string
    /** A step as the tooltip names it ("Visit 2"). */
    stepLabel?: (step: number) => string
    band?: { from: number; to: number; label: string }
  } = $props()

  const rows = $derived(steps.map((step, i): Row => ({ step, ...Object.fromEntries(series.map(s => [s.key, s.values[i] ?? null])) })))
  const lead = $derived(series[0])
  const values = $derived(series.flatMap(s => s.values).filter(v => v !== null))
  const lo = $derived(Math.min(...values))
  const hi = $derived(Math.max(lo + 1, ...values))
  const chartSeries = $derived(
    series.map((s, i) => ({
      key: s.key,
      label: s.label,
      color: TONE_VAR[s.tone],
      props: { style: `stroke: ${TONE_VAR[s.tone]}`, strokeWidth: i === 0 ? 2.5 : 1.5, 'stroke-dasharray': i === 0 ? undefined : '4 4' },
    })),
  )

  function describe(row: Row): string {
    const parts = series.map(s => {
      const v = row[s.key]
      return `${s.label} ${v === null ? '–' : format(v)}`
    })
    return `${stepLabel(row.step)}: ${parts.join(', ')}`
  }
  let context = $state<LineState | undefined>()
  const nav = createChartNav(
    () => rows.map(point => ({ seriesKey: null, point })),
    describe,
    () => context,
  )
</script>

<div class="h-[200px] w-full sm:h-auto sm:aspect-[440/210]">
  <Chart
    ssr
    bind:context
    class="block h-full w-full"
    role="img"
    aria-label={label}
    tabindex={0}
    onkeydown={nav.onkeydown}
    onblur={nav.blur}
    data={rows}
    x="step"
    series={chartSeries}
    valueAxis="y"
    xDomain={[steps[0], steps.at(-1)]}
    yDomain={[lo - (hi - lo) * 0.15, hi + (hi - lo) * 0.2]}
    padding={{ left: 32, right: 14, top: 18, bottom: 22 }}
    axis
    grid={{ x: false, y: { class: 'stroke-surface-paused', strokeWidth: 1 } }}
    rule={false}
    highlight={{ points: { r: 4, class: 'stroke-bg', strokeWidth: 2 }, lines: false }}
    tooltipContext={{ mode: 'quadtree' }}
    props={{
      xAxis: { ticks: steps, format: (n: number) => String(n), tickMarks: false, classes: { tickLabel: 'fill-text-dim text-[10px]' } },
      yAxis: { ticks: 4, tickMarks: false, classes: { tickLabel: 'fill-text-dim text-[10px]' } },
    }}
  >
    {#snippet belowMarks({ context }: { context: LineState })}
      {#if band}
        {@const x0 = scaled(context.xScale, band.from) - 10}
        {@const x1 = scaled(context.xScale, band.to) + 10}
        <rect x={x0} y={0} width={x1 - x0} height={context.height} class="fill-accent/5" />
        <Text x={(x0 + x1) / 2} y={context.height - 6} value={band.label} textAnchor="middle" class="fill-accent text-[10px]" />
      {/if}
    {/snippet}
    {#snippet marks({ context }: { context: LineState })}
      {#each context.series.visibleSeries as s (s.key)}
        <Spline seriesKey={s.key} />
      {/each}
    {/snippet}
    {#snippet aboveMarks({ context }: { context: LineState })}
      {#if lead}
        {#each rows as row (row.step)}
          {@const v = row[lead.key]}
          {#if v !== null}
            <circle cx={scaled(context.xScale, row.step)} cy={scaled(context.yScale, v)} r="3.5" class={TONE_FILL[lead.tone]} />
            <Text
              x={scaled(context.xScale, row.step)}
              y={scaled(context.yScale, v) - 9}
              value={format(v)}
              textAnchor="middle"
              class="fill-text text-[10px]"
            />
          {/if}
        {/each}
      {/if}
    {/snippet}
    {#snippet tooltip({ context }: { context: LineState })}
      <Tooltip.Root variant="none" {context}>
        {#snippet children({ data }: { data: Row })}
          <div class="chart-tooltip">{describe(data)}</div>
        {/snippet}
      </Tooltip.Root>
    {/snippet}
  </Chart>
</div>
<span class="sr-only" role="status" aria-live="polite">{nav.liveText}</span>
