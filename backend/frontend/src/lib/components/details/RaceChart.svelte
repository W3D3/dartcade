<script lang="ts">
  // Race to the Bull (ATC-Details*): targets hit against darts thrown, one stepped line per
  // player. The highlighted player (you, or the winner) draws solid lime with a dot on every
  // target done; the others grey and dashed. Each line runs on to the darts that player threw
  // and ends in a label: "Christoph · Bull, 52 darts" or "Guest 1 · 14 of 21".
  // Built from the low-level `Chart` + `Spline`, not the `LineChart` preset: that preset's
  // default `marks` snippet shadows its own `marks` prop (checking `typeof marks === 'function'`
  // from inside a snippet of the same name), which recurses infinitely under `svelte/server`'s
  // SSR renderer. `Chart`'s `marks` is a plain optional-call snippet prop, unaffected.
  import { Chart, Spline, Tooltip } from 'layerchart/svg'
  import { curveStepAfter } from 'd3-shape'
  import type { ChartState, AnyScale } from 'layerchart'
  import type { GameDetail } from '$lib/api'
  import { raceSeries } from '$lib/details/atc'
  import { targetLabel } from '$lib/details/stats'
  import { flattenByX, stepFocus } from '$lib/details/chartNav'
  import { otherColor } from '$lib/details/chartColors'

  /** Tagged with its seat: the tooltip names the player from the point it's on. `hit`: a target
   * done (the line's last point may only carry it on to the darts thrown). */
  type RacePoint = { darts: number; hits: number; seat: number; hit: boolean }
  type RaceScale = AnyScale<number, number>
  type RaceChartState = ChartState<RacePoint, RaceScale, RaceScale>

  let { detail, highlight = null }: { detail: GameDetail; highlight?: number | null } = $props()
  const atc = $derived(detail.detail.mode === 'atc' ? detail.detail : null)
  const total = $derived(Math.max(1, atc?.sequence.length ?? 0))
  const lastTarget = $derived(targetLabel(atc?.sequence.at(-1) ?? 22))

  const series = $derived(
    atc
      ? raceSeries(atc).map(s => {
          const points: RacePoint[] = s.points.map((p, i) => ({ ...p, seat: s.seat, hit: i > 0 }))
          const thrown = atc.progress.find(p => p.seat === s.seat)?.steps.reduce((n, st) => n + st.darts, 0) ?? 0
          const last = points.at(-1)
          if (last && thrown > last.darts) points.push({ ...last, darts: thrown, hit: false })
          return { seat: s.seat, points, thrown, hits: last?.hits ?? 0 }
        })
      : [],
  )
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
  const lead = $derived(highlight ?? detail.game.players.find(p => p.placement === 1)?.seat ?? series.at(0)?.seat ?? 0)
  const maxDarts = $derived(Math.max(3, ...series.map(s => s.thrown)))

  // Every 5 targets, and the last one named ("Bull") at the top; a 5 just under it would crowd it
  const yTicks = $derived([...Array.from({ length: Math.floor(total / 5) + 1 }, (_, i) => i * 5).filter(t => t <= total - 3), total])
  const xStep = $derived(maxDarts > 100 ? 20 : 10)
  const xTicks = $derived(Array.from({ length: Math.floor(maxDarts / xStep) + 1 }, (_, i) => i * xStep))

  // The others dashed: one grey line against you; several in a colour and a dash each
  const others = $derived(series.filter(s => s.seat !== lead).map(s => s.seat))
  const DASHES = ['6 4', '1 4', '10 4 2 4', '2 2']
  const colorOf = (seat: number) =>
    seat === lead ? 'var(--color-accent)' : otherColor(others.indexOf(seat), others.length, 'var(--color-ink-3)')
  function lineStyle(seat: number) {
    const style = `stroke: ${colorOf(seat)}`
    if (seat === lead) return { style, strokeWidth: 2.5, 'stroke-dasharray': undefined }
    return { style, strokeWidth: 2, 'stroke-dasharray': DASHES[others.indexOf(seat) % DASHES.length] }
  }

  // One LayerChart series per player, carrying its own points; `props` lands on the rendered
  // <path> (see Spline).
  const chartSeries = $derived(
    series.map(s => ({
      key: String(s.seat),
      data: s.points,
      color: colorOf(s.seat),
      props: lineStyle(s.seat),
    })),
  )

  function endLabel(s: (typeof series)[number]): string {
    if (s.hits < total) return `${nameOf(s.seat)} · ${s.hits} of ${total}`
    return `${nameOf(s.seat)} · ${lastTarget}, ${s.thrown}${series.length <= 2 ? ' darts' : ''}`
  }

  // End labels at their line's end, pushed apart (top down) so close finishes don't overlap
  const LABEL_GAP = 16
  function endLabels(context: RaceChartState) {
    const labels = series
      .map(s => ({ seat: s.seat, text: endLabel(s), x: Number(context.xScale(s.thrown)) + 8, y: Number(context.yScale(s.hits)) + 4 }))
      .sort((a, b) => a.y - b.y)
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + LABEL_GAP)
    return labels
  }

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

  const tickLabel = 'fill-text-dim font-mono text-[12px]'
</script>

{#if atc}
  <section aria-label="Race to the Bull" class="flex flex-col gap-2 min-w-0 box-border p-4 md:p-6 card">
    <h2 class="m-0 font-display font-bold text-[24px] md:text-[28px] leading-none uppercase">Race to the Bull</h2>
    <figure class="m-0 flex flex-col gap-2">
      <figcaption class="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-muted">
        <span>Targets hit against darts thrown</span>
        {#each [...series].sort((a, b) => Number(b.seat === lead) - Number(a.seat === lead)) as s, i (s.seat)}
          {@const style = lineStyle(s.seat)}
          <span class="inline-flex items-center gap-[6px] {i === 0 ? 'md:ml-auto' : ''}">
            <svg width="16" height="4" aria-hidden="true"
              ><path d="M0 2H16" style={style.style} stroke-width="2" stroke-dasharray={style['stroke-dasharray']} /></svg
            >{nameOf(s.seat)}
          </span>
        {/each}
      </figcaption>
      <!-- The height sits on a wrapper: the chart fills its parent (its own height: 100% wins over a class) -->
      <div class="h-[240px] md:h-[300px]">
        <Chart
          ssr
          bind:context={chartContext}
          class="block w-full h-full"
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
          padding={{ left: 40, right: series.length > 2 ? 140 : 190, top: 12, bottom: 28 }}
          axis
          grid={{ x: false, y: { class: 'stroke-line', strokeWidth: 1 }, yTicks }}
          rule={false}
          highlight={{ points: { r: 4, class: 'stroke-surface-panel', strokeWidth: 2 }, lines: false }}
          tooltipContext={{ mode: 'quadtree' }}
          props={{
            xAxis: { ticks: xTicks, tickMarks: false, classes: { tickLabel } },
            yAxis: {
              ticks: yTicks,
              tickMarks: false,
              format: (v: number) => (v === total ? lastTarget : String(v)),
              classes: { tickLabel },
            },
          }}
        >
          {#snippet marks({ context }: { context: RaceChartState })}
            <!-- The others first, so the highlighted line draws on top -->
            {#each [...context.series.visibleSeries].sort((a, b) => Number(a.key === String(lead)) - Number(b.key === String(lead))) as s (s.key)}
              <Spline seriesKey={s.key} curve={curveStepAfter} />
            {/each}
          {/snippet}
          {#snippet aboveMarks({ context }: { context: RaceChartState })}
            {#each series.find(s => s.seat === lead)?.points ?? [] as p, i (i)}
              {#if p.hit}
                <circle
                  cx={context.xScale(p.darts)}
                  cy={context.yScale(p.hits)}
                  r="3.5"
                  class="fill-accent stroke-surface-panel"
                  stroke-width="2"
                />
              {/if}
            {/each}
            {#each endLabels(context) as l (l.seat)}
              <!-- Several others: each label in its line's colour, to tie the two together -->
              <text
                x={l.x}
                y={l.y}
                class="text-[12.5px] md:text-[13px] {l.seat === lead ? 'fill-text font-semibold' : 'fill-text-muted'}"
                style:fill={l.seat !== lead && others.length > 1 ? colorOf(l.seat) : undefined}>{l.text}</text
              >
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
      </div>
    </figure>
    <span class="sr-only" role="status" aria-live="polite">{liveText}</span>
  </section>
{/if}
