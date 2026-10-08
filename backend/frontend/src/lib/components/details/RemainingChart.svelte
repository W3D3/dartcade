<script lang="ts">
  // Points left after each visit, one line per side (X01-Details): lime for the highlighted (or
  // first) side, dashed grey for the others; a ring on 100+ visits, a bigger one on 180.
  // Built from the low-level `Chart` + `Spline`, not the `LineChart` preset: that preset's
  // default `marks` snippet shadows its own `marks` prop (checking `typeof marks === 'function'`
  // from inside a snippet of the same name), which recurses infinitely under `svelte/server`'s
  // SSR renderer. `Chart`'s `marks` is a plain optional-call snippet prop, unaffected.
  import { Chart, Spline, Tooltip } from 'layerchart/svg'
  import type { ChartState, AnyScale } from 'layerchart'
  import { remainingTicks, type Side } from '$lib/details/x01'
  import { flattenByX, stepFocus } from '$lib/details/chartNav'

  type Visit = { visit: number; left: number; scored: number }
  /** A visit tagged with its side: the tooltip names the side from the point it's on. */
  type Point = Visit & { side: number }
  type PointScale = AnyScale<number, number>
  type PointChartState = ChartState<Point, PointScale, PointScale>
  let {
    series,
    sides,
    start,
    highlight = null,
  }: { series: { key: number; points: Visit[] }[]; sides: Side[]; start: number; highlight?: number | null } = $props()

  const tagged = $derived(series.map(s => ({ key: s.key, points: s.points.map(p => ({ ...p, side: s.key })) })))
  const maxVisits = $derived(Math.max(1, ...series.map(s => s.points.length - 1)))
  const lead = $derived(highlight === null ? (series[0]?.key ?? 0) : highlight)
  const name = (key: number) => sides.find(s => s.key === key)?.name ?? ''
  const ticks = $derived(remainingTicks(start))

  // One LayerChart series per side, carrying its own points; `props` lands on the rendered
  // <path> (see Spline), so the highlighted side draws solid lime, the rest dashed grey.
  const chartSeries = $derived(
    tagged.map(s => ({
      key: String(s.key),
      data: s.points,
      color: s.key === lead ? 'var(--color-accent)' : 'var(--color-line-pip)',
      props: {
        class: s.key === lead ? 'stroke-accent' : 'stroke-line-pip',
        strokeWidth: s.key === lead ? 2.5 : 1.5,
        strokeDasharray: s.key === lead ? undefined : '4 4',
      },
    })),
  )

  // Keyboard path (pointer hover alone doesn't reach keyboard/screen-reader users): Left/Right
  // steps through every visit of every side in x order, Escape clears it. Showing the point
  // through the chart's own tooltip state keeps the pointer-driven tooltip snippet below as the
  // single source of its text; the live region repeats that text for screen readers, since
  // nothing moves focus onto the (positioned, not tabbable) tooltip itself.
  const navPoints = $derived(flattenByX(tagged, p => p.visit))
  let focusIndex = $state<number | null>(null)
  let chartContext = $state<PointChartState | undefined>()

  function describe(data: Point): string {
    if (data.visit === 0) return `${name(data.side)}: ${start} to start`
    return `${name(data.side)}, visit ${data.visit}: scored ${data.scored}, ${data.left} left`
  }

  const liveText = $derived.by(() => {
    const n = focusIndex === null ? undefined : navPoints.at(focusIndex)
    return n ? describe(n.point) : ''
  })

  function focusPoint(index: number | null) {
    focusIndex = index
    const n = index === null ? undefined : navPoints.at(index)
    if (n) chartContext?.tooltip.show({ data: n.point })
    else chartContext?.tooltip.hide()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusPoint(stepFocus(focusIndex, 1, navPoints.length))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusPoint(stepFocus(focusIndex, -1, navPoints.length))
    } else if (e.key === 'Escape' && focusIndex !== null) {
      e.preventDefault()
      focusPoint(null)
    }
  }
</script>

<figure class="m-0 flex flex-col gap-2">
  <figcaption class="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-muted">
    <span>Points remaining after each visit</span>
    {#each series as s (s.key)}
      <span class="inline-flex items-center gap-[6px] {s.key === lead ? 'ml-auto md:ml-0' : ''}"
        ><span class="w-4 h-[2px] {s.key === lead ? 'bg-accent' : 'bg-line-pip'}"></span>{name(s.key)}</span
      >
    {/each}
  </figcaption>
  <Chart
    ssr
    bind:context={chartContext}
    class="block w-full aspect-[720/200]"
    role="img"
    aria-label="Points left after each visit"
    tabindex={0}
    onkeydown={onKeydown}
    onblur={() => focusPoint(null)}
    series={chartSeries}
    x="visit"
    y="left"
    valueAxis="y"
    xDomain={[0, maxVisits]}
    yDomain={[0, start]}
    xNice={false}
    yNice={false}
    padding={{ left: 44, right: 20, top: 12, bottom: 16 }}
    axis="y"
    grid={{ x: false, y: { class: 'stroke-line', strokeWidth: 1 }, yTicks: ticks }}
    rule={false}
    highlight={{ points: { r: 4, class: 'stroke-bg', strokeWidth: 2 }, lines: false }}
    tooltipContext={{ mode: 'quadtree' }}
    props={{
      yAxis: { ticks, tickMarks: false, classes: { tickLabel: 'fill-text-dim text-[11px]' } },
    }}
  >
    {#snippet marks({ context }: { context: PointChartState })}
      {#each context.series.visibleSeries as s (s.key)}
        <Spline seriesKey={s.key} />
      {/each}
    {/snippet}
    {#snippet aboveMarks({ context }: { context: PointChartState })}
      {#each series as s (s.key)}
        {#each s.points as p, i (i)}
          {#if p.scored >= 100}
            <circle
              cx={context.xScale(p.visit)}
              cy={context.yScale(p.left)}
              r={p.scored === 180 ? 10 : 7}
              fill="none"
              stroke-width={p.scored === 180 ? 3 : 1.5}
              class={s.key === lead ? 'stroke-accent' : 'stroke-line-pip'}
            />
          {/if}
        {/each}
      {/each}
    {/snippet}
    {#snippet tooltip({ context }: { context: PointChartState })}
      <Tooltip.Root variant="none" {context}>
        {#snippet children({ data }: { data: Point })}
          <div
            class="bg-surface-inset border border-line-popover rounded-[10px] px-2.5 py-1.5 text-text text-[13px] whitespace-nowrap shadow-tooltip"
          >
            {describe(data)}
          </div>
        {/snippet}
      </Tooltip.Root>
    {/snippet}
  </Chart>
  <span class="sr-only" role="status" aria-live="polite">{liveText}</span>
</figure>
