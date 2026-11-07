<script lang="ts">
  // A bar per item with a trend line over them (Stats.dc.html: average per leg). Each bar has its
  // tone (won, lost), one can be picked out in lime with a label, and a dashed line marks a
  // reference (the range before's average). Hover or Left/Right (with the chart focused) shows an
  // item's numbers.
  import { Bars, Chart, Rule, Spline, Text, Tooltip } from 'layerchart/svg'
  import type { AnyScale, ChartState } from 'layerchart'
  import { createChartNav } from '$lib/details/chartNav.svelte'
  import { bandwidth, scaled } from '$lib/stats/chart'
  import { TONE_FILL, type Tone } from '$lib/stats/tones'

  export type TrendBar = { value: number | null; trend: number | null; tone: Tone; describe: string }
  type Row = TrendBar & { i: number }
  type BarsState = ChartState<Row, AnyScale, AnyScale<number, number>>

  let {
    bars,
    highlight = null,
    reference = null,
    label,
    startLabel,
    endLabel,
  }: {
    bars: TrendBar[]
    /** The bar drawn lime, with its label beside it. */
    highlight?: { index: number; label: string } | null
    reference?: { value: number; label: string } | null
    label: string
    /** Under the first and last bar ("50 legs ago", "latest"). */
    startLabel: string
    endLabel: string
  } = $props()

  const rows = $derived(bars.map((b, i): Row => ({ ...b, i, tone: i === highlight?.index ? 'accent' : b.tone })))
  const tones = $derived([...new Set(rows.map(r => r.tone))])
  const values = $derived([...rows.flatMap(r => (r.value === null ? [] : [r.value])), ...(reference ? [reference.value] : [])])
  const lo = $derived(Math.max(0, Math.floor(Math.min(...values) / 20) * 20 - 20))
  const hi = $derived(Math.ceil(Math.max(lo + 20, ...values) / 20) * 20)
  const shown = $derived(rows.filter(r => r.value !== null))

  let context = $state<BarsState | undefined>()
  const nav = createChartNav(
    () => shown.map(point => ({ seriesKey: null, point })),
    r => r.describe,
    () => context,
  )
</script>

<div class="h-[200px] w-full sm:h-auto sm:aspect-[700/240]">
  <Chart
    ssr
    bind:context
    class="block h-full w-full"
    role="img"
    aria-label={label}
    tabindex={0}
    onkeydown={nav.onkeydown}
    onblur={nav.blur}
    data={shown}
    x="i"
    y="value"
    valueAxis="y"
    xDomain={rows.map(r => r.i)}
    yDomain={[lo, hi]}
    yNice={false}
    bandPadding={0.3}
    padding={{ left: 34, right: 6, top: 14, bottom: 22 }}
    axis="y"
    grid={{ x: false, y: { class: 'stroke-surface-paused', strokeWidth: 1 } }}
    rule={false}
    tooltipContext={{ mode: 'band' }}
    props={{ yAxis: { ticks: 5, tickMarks: false, classes: { tickLabel: 'fill-text-dim text-[11px]' } } }}
  >
    {#snippet marks()}
      {#each tones as tone (tone)}
        <Bars
          data={shown.filter(r => r.tone === tone)}
          y={(r: Row) => [lo, r.value ?? lo]}
          radius={2}
          rounded="top"
          class={TONE_FILL[tone]}
        />
      {/each}
      <Spline data={rows.filter(r => r.trend !== null)} y="trend" class="fill-none stroke-accent" strokeWidth={2.5} />
    {/snippet}
    {#snippet aboveMarks({ context }: { context: BarsState })}
      {#if reference}
        <Rule y={reference.value} class="stroke-text-muted [stroke-dasharray:4_4]" />
        <Text x={6} y={scaled(context.yScale, reference.value) - 6} value={reference.label} class="fill-text-muted text-[11px]" />
      {/if}
      {#if highlight}
        {@const row = rows.at(highlight.index)}
        {#if row?.value != null}
          {@const cx = scaled(context.xScale, row.i) + bandwidth(context.xScale) / 2}
          {@const right = cx > context.width / 2}
          <circle {cx} cy={scaled(context.yScale, row.value)} r="4" class="fill-bg stroke-accent" stroke-width="2" />
          <Text
            x={cx + (right ? -8 : 8)}
            y={scaled(context.yScale, row.value) + 4}
            value={highlight.label}
            textAnchor={right ? 'end' : 'start'}
            class="fill-text text-[11px] font-semibold"
          />
        {/if}
      {/if}
      <Text x={0} y={context.height + 18} value={startLabel} class="fill-text-dim text-[11px]" />
      <Text x={context.width} y={context.height + 18} value={endLabel} textAnchor="end" class="fill-text-dim text-[11px]" />
    {/snippet}
    {#snippet tooltip({ context }: { context: BarsState })}
      <Tooltip.Root variant="none" {context}>
        {#snippet children({ data }: { data: Row })}
          <div class="chart-tooltip">{data.describe}</div>
        {/snippet}
      </Tooltip.Root>
    {/snippet}
  </Chart>
</div>
<span class="sr-only" role="status" aria-live="polite">{nav.liveText}</span>
