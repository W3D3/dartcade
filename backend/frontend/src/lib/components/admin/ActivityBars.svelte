<script lang="ts">
  // The Activity page's bar chart: one stacked bar per day, week or month, titled axes, a legend when
  // there are several series, an exact-value tooltip on hover and Left/Right, and a click (or Enter on the
  // focused bar) that hands the bucket to `onpick` for the drill-down.
  import { Bars, Chart, Tooltip } from 'layerchart/svg'
  import type { AnyScale, ChartState } from 'layerchart'
  import { createChartNav } from '$lib/details/chartNav.svelte'
  import { chartGrid, integerTicks } from '$lib/charts/grid'
  import { bucketName, bucketTick, formatCount, type Bucket, type Granularity } from '$lib/admin/activity'

  export type Series = { key: string; label: string; fill: string; swatch: string }
  type Row = { i: number; bucket: Bucket; lo: Record<string, number>; hi: Record<string, number> }
  type BarsState = ChartState<Row, AnyScale, AnyScale<number, number>>

  let {
    buckets,
    series,
    granularity,
    yTitle,
    unit,
    label,
    onpick,
  }: {
    buckets: Bucket[]
    series: Series[]
    granularity: Granularity
    /** The y axis title: what is counted ("Games played"). */
    yTitle: string
    /** What one is called in the tooltip ("games"). */
    unit: string
    label: string
    onpick: (bucket: Bucket) => void
  } = $props()

  const xTitle = $derived({ day: 'Day (UTC)', week: 'Week (UTC, from Monday)', month: 'Month (UTC)' }[granularity])
  const rows = $derived(
    buckets.map((bucket, i): Row => {
      const lo: Record<string, number> = {}
      const hi: Record<string, number> = {}
      let sum = 0
      for (const s of series) {
        lo[s.key] = sum
        sum += bucket.parts[s.key] ?? 0
        hi[s.key] = sum
      }
      return { i, bucket, lo, hi }
    }),
  )
  const peak = $derived(Math.max(1, ...buckets.map(b => b.total)))
  const yTicks = $derived(integerTicks(0, peak, 5))
  const yMax = $derived(Math.max(peak, yTicks.at(-1) ?? 0))

  let width = $state(0)
  // About 64 px per label keeps the dates apart on a phone
  const xTicks = $derived(integerTicks(0, Math.max(0, rows.length - 1), Math.max(2, Math.floor(width / 64))))

  const describe = (r: Row): string => {
    const parts = series.filter(s => r.bucket.parts[s.key]).map(s => `${s.label} ${formatCount(r.bucket.parts[s.key])}`)
    return `${bucketName(r.bucket, granularity)}: ${formatCount(r.bucket.total)} ${unit}${series.length > 1 && parts.length ? ` (${parts.join(', ')})` : ''}`
  }

  let context = $state<BarsState | undefined>()
  const nav = createChartNav(
    () => rows.map(point => ({ seriesKey: null, point })),
    describe,
    () => context,
  )
  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      const shown = rows.find(r => r === context?.tooltip.data)
      if (shown) onpick(shown.bucket)
      return
    }
    nav.onkeydown(e)
  }
</script>

<div class="flex flex-col gap-2">
  {#if series.length > 1}
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted" aria-label="Legend">
      {#each series as s (s.key)}
        <li class="flex items-center gap-2"><span class="size-3 rounded-xs {s.swatch}"></span>{s.label}</li>
      {/each}
    </ul>
  {/if}
  <div class="h-60 w-full cursor-pointer md:h-72" bind:clientWidth={width}>
    <Chart
      ssr
      bind:context
      class="block size-full"
      role="img"
      aria-label="{label}. Click a bar for what is behind it."
      tabindex={0}
      {onkeydown}
      onblur={nav.blur}
      data={rows}
      x="i"
      y="i"
      valueAxis="y"
      xDomain={rows.map(r => r.i)}
      yDomain={[0, yMax]}
      yNice={false}
      bandPadding={0.2}
      padding={{ left: 62, right: 8, top: 10, bottom: 56 }}
      axis
      grid={chartGrid(xTicks, { class: 'stroke-surface-paused', strokeWidth: 1, yTicks })}
      rule={false}
      tooltipContext={{ mode: 'band', onclick: (_e: MouseEvent, { data }: { data: Row }) => onpick(data.bucket) }}
      props={{
        xAxis: {
          ticks: xTicks,
          format: (i: number) => (buckets[i] ? bucketTick(buckets[i], granularity) : ''),
          label: xTitle,
          labelPlacement: 'middle',
          tickMarks: false,
          classes: { tickLabel: 'fill-text-dim text-caption', label: 'fill-text-muted text-small' },
        },
        yAxis: {
          ticks: yTicks,
          format: (n: number) => formatCount(n),
          label: yTitle,
          labelPlacement: 'middle',
          tickMarks: false,
          classes: { tickLabel: 'fill-text-dim text-caption', label: 'fill-text-muted text-small' },
        },
      }}
    >
      {#snippet marks()}
        {#each series as s (s.key)}
          <Bars data={rows.filter(r => r.hi[s.key] > r.lo[s.key])} y={(r: Row) => [r.lo[s.key], r.hi[s.key]]} class={s.fill} />
        {/each}
      {/snippet}
      {#snippet tooltip({ context }: { context: BarsState })}
        <Tooltip.Root variant="none" {context}>
          {#snippet children({ data }: { data: Row })}
            <div class="chart-tooltip">{describe(data)}</div>
          {/snippet}
        </Tooltip.Root>
      {/snippet}
    </Chart>
  </div>
</div>
<span class="sr-only" role="status" aria-live="polite">{nav.liveText}</span>
