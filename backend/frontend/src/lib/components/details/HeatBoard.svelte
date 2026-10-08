<script lang="ts">
  // The heatmap view's board: a muted dartboard (SVG), a fuzzy heat layer (canvas, simpleheat)
  // and a dot per positioned dart, all in the same BOARD_VIEW_HALF box so they can never drift
  // apart — they all read the same toBoardPx/clampToView helpers.
  import { onMount } from 'svelte'
  import simpleheat from 'simpleheat'
  import { R } from '$shared/board.js'
  import { BOARD_VIEW_HALF, boardLabel, clampToView, toBoardPx, type HeatDart } from '../../details/heatmap.js'
  import { boardNumbers, boardSegments } from '../../details/boardGeometry.js'
  import { dartLabel } from '../../details/x01.js'

  let { darts, name }: { darts: HeatDart[]; name: string } = $props()

  const segments = boardSegments()
  const numbers = boardNumbers()
  const BULL25_PX = R.bull25 * 170
  const BULL50_PX = R.bull50 * 170
  const VIEW = BOARD_VIEW_HALF
  const viewBox = `-${VIEW} -${VIEW} ${VIEW * 2} ${VIEW * 2}`

  // Classic heatmap colours, cool to hot. The legend uses the same stops, rescaled so the first
  // stop (blue) sits at 0% of the bar and the last (red) at 100% — the bar always reads as a full
  // blue-to-red ramp, unlike the canvas gradient below which fades in from transparent at low
  // density.
  const HEAT_STOPS: Record<number, string> = {
    0.2: '#2b6cff',
    0.45: '#22d3ee',
    0.6: '#4ade80',
    0.75: '#facc15',
    0.88: '#f97316',
    1: '#ef4444',
  }
  // Sorted: Object.entries lists the integer key 1 before 0.2, 0.45, … (integer keys come first).
  const HEAT_LEGEND_STOPS = Object.entries(HEAT_STOPS)
    .map(([at, c]) => ({ at: Number(at), c }))
    .sort((a, b) => a.at - b.at)
  const HEAT_LEGEND_MIN = Math.min(...HEAT_LEGEND_STOPS.map(s => s.at))
  const HEAT_LEGEND_MAX = Math.max(...HEAT_LEGEND_STOPS.map(s => s.at))
  const HEAT_LEGEND = `linear-gradient(to right, ${HEAT_LEGEND_STOPS.map(
    ({ at, c }) => `${c} ${Math.round(((at - HEAT_LEGEND_MIN) / (HEAT_LEGEND_MAX - HEAT_LEGEND_MIN)) * 100)}%`,
  ).join(', ')})`

  /** A dart's label on the heat board: `dartLabel` reports a near-miss (multiplier 0) as "–", but
   *  on the board — where it's pointed at by a hovered dot, not read as a dash in a chalkboard
   *  cell — that reads better as "Miss". */
  function dotLabel(segment: HeatDart['segment']): string {
    return segment.multiplier === 0 ? 'Miss' : dartLabel(segment)
  }

  const positioned = $derived(darts.filter((d): d is HeatDart & { coords: { x: number; y: number } } => d.coords !== null))
  // Clamped to the viewBox's rim for drawing only — stats (grouping included) read `darts`/
  // `positioned` directly, never these display-only points. The label rides along so a dot and
  // its dart stay paired through the clamp.
  const dots = $derived(positioned.map(d => ({ ...clampToView(toBoardPx(d.coords)), label: dotLabel(d.segment) })))
  const label = $derived(boardLabel(name, darts))
  const emptyText = $derived(
    darts.length === 0
      ? 'No darts thrown'
      : positioned.length === 0
        ? darts.every(d => d.manual)
          ? 'No dart positions — these darts were entered by hand'
          : 'No dart positions'
        : null,
  )

  /** A ring's fill, one surface tone lighter for the treble/double rings than that segment's
   *  own single-ring tone (odd segments one step up the ramp, even segments the next). */
  function ringFillClass(ring: 'single' | 'treble' | 'double', odd: boolean): string {
    if (ring === 'single') return odd ? 'fill-surface-chip' : 'fill-surface-active'
    return odd ? 'fill-surface-key' : 'fill-surface-chip'
  }

  // Which dot (by index into `dots`) is hovered or tapped: grows it a little and shows its label
  // in a small tooltip. Indexing by position rather than by dart identity means switching the
  // selected player (a new `darts` array) just re-labels whatever dot sits at that index — and
  // `?? null` covers an index that no longer exists if the new array is shorter.
  let hovered = $state<number | null>(null)
  const hoveredDot = $derived(hovered === null ? null : (dots[hovered] ?? null))

  function hoverDot(i: number) {
    hovered = i
  }
  function unhoverDot(i: number) {
    if (hovered === i) hovered = null
  }
  function tapDot(e: PointerEvent, i: number) {
    // Stop the tap reaching the board below, whose own pointerdown clears `hovered` — otherwise
    // a tap on a dot would set and immediately unset it.
    e.stopPropagation()
    hovered = i
  }

  /** Positions the tooltip next to its dot, flipped toward whichever side keeps it inside the
   *  board: left/above when the dot sits right/below of centre, right/below otherwise. */
  function tooltipStyle(d: { x: number; y: number }): string {
    const leftPct = ((d.x + VIEW) / (VIEW * 2)) * 100
    const topPct = ((d.y + VIEW) / (VIEW * 2)) * 100
    const tx = d.x > 0 ? 'calc(-100% - 8px)' : '8px'
    const ty = d.y > 0 ? 'calc(-100% - 8px)' : '8px'
    return `left: ${leftPct}%; top: ${topPct}%; transform: translate(${tx}, ${ty});`
  }

  let wrapEl: HTMLDivElement | undefined
  let canvasEl: HTMLCanvasElement | undefined
  let lastPx: number | null = null

  function canvasPx(): number | null {
    if (!canvasEl || !wrapEl) return null
    const cssSize = Math.max(1, wrapEl.getBoundingClientRect().width)
    const dpr = window.devicePixelRatio || 1
    return Math.max(1, Math.round(cssSize * dpr))
  }

  function draw() {
    const px = canvasPx()
    if (px === null || !canvasEl) return
    if (canvasEl.width !== px || canvasEl.height !== px) {
      canvasEl.width = px
      canvasEl.height = px
    }
    lastPx = px
    const heat = simpleheat(canvasEl)
    if (dots.length === 0) {
      heat.clear().draw()
      return
    }
    // The same BOARD_VIEW_HALF box maps to the canvas 0..px box for every point, so the heat and
    // the dots (both already clamped to that box above) can never disagree about where a dart
    // landed.
    const toCanvasPx = (u: number) => ((u + VIEW) / (VIEW * 2)) * px
    // Blob radius/blur scale with the board's rendered size, so the look is the same at 500 px
    // and at phone width. 12 mm (about a treble bed's width) with a short blur keeps clusters
    // tight instead of one big haze.
    const r = (12 / (VIEW * 2)) * px
    // `max` is how much overlap counts as hottest: about one dart in 22, so a real cluster of
    // 6–8 darts reaches red while a single stray dart stays a faint blue.
    const hottest = Math.max(1.5, dots.length / 22)
    heat
      .data(dots.map((p): [number, number, number] => [toCanvasPx(p.x), toCanvasPx(p.y), 1]))
      .max(hottest)
      .radius(r, r * 0.8)
      // simpleheat only copies each stop's RGB; the density supplies the alpha (down to the 0.05
      // floor below).
      .gradient(HEAT_STOPS)
      .draw(0.05)
  }

  // Canvas and simpleheat are browser-only: $effect and onMount never run during SSR, so this
  // never touches `document`/`window` while the details page renders on the server. The $effect
  // alone handles the first draw (reading `dots`, so it also redraws whenever the selected
  // player's positioned darts change); onMount only wires up the ResizeObserver. Its first
  // callback fires as soon as observation starts, at the same size `$effect` already drew, so
  // `draw()` skipping a same-size redraw (via `lastPx`) is what actually keeps mount to one draw
  // — not the comment alone. Resize callbacks are coalesced into a single rAF, cancelled on
  // teardown, so a window drag doesn't rebuild the heat on every frame.
  onMount(() => {
    if (!wrapEl) return
    let rafId: number | null = null
    const ro = new ResizeObserver(() => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (canvasPx() === lastPx) return
        draw()
      })
    })
    ro.observe(wrapEl)
    return () => {
      ro.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  })
  $effect(draw)
</script>

<div class="flex flex-col items-center gap-3">
  <div bind:this={wrapEl} role="presentation" class="relative w-full max-w-[500px] aspect-square" onpointerdown={() => (hovered = null)}>
    <svg {viewBox} role="img" aria-label={label} class="absolute inset-0 w-full h-full">
      <circle cx="0" cy="0" r="199" class="fill-bg-deep" />
      {#each segments as s, i (i)}
        <path
          d={s.d}
          class={ringFillClass(s.ring, s.odd)}
          stroke="var(--color-bg-deep)"
          stroke-width="1"
          stroke-opacity="0.5"
          vector-effect="non-scaling-stroke"
        />
      {/each}
      <circle cx="0" cy="0" r={BULL25_PX} class="fill-surface-chip" />
      <circle cx="0" cy="0" r={BULL50_PX} class="fill-surface-key" />
      {#each numbers as n (n.n)}
        <text
          x={n.x}
          y={n.y}
          text-anchor="middle"
          dy="0.35em"
          class="fill-text-dim"
          font-size="18"
          font-family="Barlow Condensed, sans-serif"
          font-weight="600"
        >
          {n.n}
        </text>
      {/each}
    </svg>

    <canvas bind:this={canvasEl} aria-hidden="true" class="absolute inset-0 w-full h-full"></canvas>

    <!-- Not aria-hidden: each dot's <title> is its accessible name and native-tooltip fallback.
         The dots themselves carry no tabindex, so they never become extra tab stops. -->
    <svg {viewBox} class="absolute inset-0 w-full h-full">
      {#each dots as d, i (i)}
        <g
          role="img"
          aria-label={d.label}
          onpointerenter={() => hoverDot(i)}
          onpointerleave={() => unhoverDot(i)}
          onpointerdown={e => tapDot(e, i)}
          class="cursor-pointer"
        >
          <title>{d.label}</title>
          <!-- Invisible, larger hit area: a comfortable touch/pointer target around the small dot. -->
          <circle cx={d.x} cy={d.y} r="6" fill="transparent" />
          <circle
            class="heat-dot"
            cx={d.x}
            cy={d.y}
            r={hovered === i ? 3.5 : 2.2}
            fill="var(--color-bg-deep)"
            fill-opacity="0.75"
            stroke={hovered === i ? 'var(--color-accent)' : 'var(--color-text)'}
            stroke-opacity={hovered === i ? 1 : 0.7}
            stroke-width={hovered === i ? 1.5 : 1}
            pointer-events="none"
          />
        </g>
      {/each}
    </svg>

    {#if emptyText}
      <div class="absolute inset-0 flex items-center justify-center p-6 text-center">
        <p class="m-0 text-[13px] text-text-muted">{emptyText}</p>
      </div>
    {/if}

    {#if hoveredDot}
      <div
        class="pointer-events-none absolute z-10 whitespace-nowrap rounded-[10px] border border-line-popover bg-surface-inset px-2.5 py-1.5 text-[13px] text-text shadow-tooltip"
        style={tooltipStyle(hoveredDot)}
      >
        {hoveredDot.label}
      </div>
    {/if}
  </div>

  <div class="flex items-center justify-center gap-2 text-[12px] text-text-dim" aria-hidden="true">
    <span>Fewer</span>
    <span class="h-2 w-24 rounded-full" style="background: {HEAT_LEGEND}"></span>
    <span class="whitespace-nowrap">More darts</span>
    <span class="ml-1.5 inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg width="8" height="8" viewBox="0 0 8 8"
        ><circle
          cx="4"
          cy="4"
          r="3"
          fill="var(--color-bg-deep)"
          fill-opacity="0.75"
          stroke="var(--color-text)"
          stroke-opacity="0.7"
          stroke-width="1"
        /></svg
      >
      Dart
    </span>
  </div>
</div>
