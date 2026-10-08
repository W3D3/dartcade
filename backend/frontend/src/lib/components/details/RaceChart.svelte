<script lang="ts">
  // Race to the Bull (ATC-Details*): targets hit against darts thrown, one line per player; the
  // highlighted (you, or the winner) in lime.
  // Built from the low-level `Chart` + `Spline`, not the `LineChart` preset: that preset's
  // default `marks` snippet shadows its own `marks` prop (checking `typeof marks === 'function'`
  // from inside a snippet of the same name), which recurses infinitely under `svelte/server`'s
  // SSR renderer. `Chart`'s `marks` is a plain optional-call snippet prop, unaffected.
  import { Chart, Spline, Tooltip } from 'layerchart/svg'
  import type { ChartState, AnyScale } from 'layerchart'
  import type { GameDetail } from '$lib/api'
  import { raceSeries } from '$lib/details/atc'
  import { flattenByX, stepFocus } from '$lib/details/chartNav'

  /** Tagged with its seat: the tooltip names the player from the point it's on. */
  type RacePoint = { darts: number; hits: number; seat: number }
  type RaceScale = AnyScale<number, number>
  type RaceChartState = ChartState<RacePoint, RaceScale, RaceScale>

  let { detail, highlight = null }: { detail: GameDetail; highlight?: number | null } = $props()
  const atc = $derived(detail.detail.mode === 'atc' ? detail.detail : null)
  const series = $derived((atc ? raceSeries(atc) : []).map(s => ({ ...s, points: s.points.map(p => ({ ...p, seat: s.seat })) })))
  const total = $derived(Math.max(1, atc?.sequence.length ?? 0))
  const maxDarts = $derived(Math.max(3, ...series.flatMap(s => s.points.map(p => p.darts))))
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''

  // One LayerChart series per player, carrying its own points; `props` lands on the rendered
  // <path> (see Spline), so the highlighted player draws solid lime, the rest dashed grey.
  const chartSeries = $derived(
    series.map(s => ({
      key: String(s.seat),
      data: s.points,
      color: s.seat === highlight ? 'var(--color-accent)' : 'var(--color-line-pip)',
      props: {
        class: s.seat === highlight ? 'stroke-accent' : 'stroke-line-pip',
        strokeWidth: s.seat === highlight ? 2.5 : 1.5,
        strokeDasharray: s.seat === highlight ? undefined : '4 4',
      },
    })),
  )

  // Keyboard path (pointer hover alone doesn't reach keyboard/screen-reader users): Left/Right
  // steps through every dart-thrown point of every player in x order, Escape clears it. Showing
  // the point through the chart's own tooltip state keeps the pointer-driven tooltip snippet
  // below as the single source of its text; the live region repeats that text for screen
  // readers, since nothing moves focus onto the (positioned, not tabbable) tooltip itself.
  const navPoints = $derived(
    flattenByX(
      series.map(s => ({ key: s.seat, points: s.points })),
      p => p.darts,
    ),
  )
  let focusIndex = $state<number | null>(null)
  let chartContext = $state<RaceChartState | undefined>()

  function describe(data: RacePoint): string {
    return `${nameOf(data.seat)}: ${data.hits} targets after ${data.darts} darts`
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

{#if atc}
  <section aria-label="Race to the Bull" class="flex flex-col gap-2 min-w-0 box-border p-4 md:p-6 card">
    <h2 class="m-0 font-display font-bold text-[24px] md:text-[28px] leading-none uppercase">Race to the Bull</h2>
    <p class="m-0 text-[13px] text-text-muted">Targets hit against darts thrown</p>
    <Chart
      ssr
      bind:context={chartContext}
      class="block w-full aspect-[720/220]"
      role="img"
      aria-label="Targets hit against darts thrown"
      tabindex={0}
      onkeydown={onKeydown}
      onblur={() => focusPoint(null)}
      series={chartSeries}
      x="darts"
      y="hits"
      valueAxis="y"
      xDomain={[0, maxDarts]}
      yDomain={[0, total]}
      xNice={false}
      yNice={false}
      padding={{ left: 36, right: 20, top: 12, bottom: 24 }}
      axis={false}
      grid={false}
      props={{ rule: { class: 'stroke-line' } }}
      highlight={{ points: { r: 4, class: 'stroke-bg', strokeWidth: 2 }, lines: false }}
      tooltipContext={{ mode: 'quadtree' }}
    >
      {#snippet marks({ context }: { context: RaceChartState })}
        {#each context.series.visibleSeries as s (s.key)}
          <Spline seriesKey={s.key} />
        {/each}
      {/snippet}
      {#snippet aboveMarks({ context }: { context: RaceChartState })}
        {#each series as s (s.seat)}
          {@const last = s.points.at(-1)}
          {#if last}
            <text x={Number(context.xScale(last.darts)) + 6} y={Number(context.yScale(last.hits)) + 4} class="fill-text-muted text-[12px]">
              {nameOf(s.seat)}
            </text>
          {/if}
        {/each}
      {/snippet}
      {#snippet tooltip({ context }: { context: RaceChartState })}
        <Tooltip.Root variant="none" {context}>
          {#snippet children({ data }: { data: RacePoint })}
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
  </section>
{/if}
