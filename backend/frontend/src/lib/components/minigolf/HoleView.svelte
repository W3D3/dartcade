<!--
  A minigolf hole drawn in course space (mm, y down) in the design's look (Minigolf.dc.html):
  felt, cream rails, red bumpers, hills, bowls and bumps shaded by height with contour lines, the tee, the cup and flag,
  and the ball. With `onPlace`, the ball can be dragged anywhere. Bench aids: `forces` draws the slopes' push as arrows, `debug` the cup's
  capture radius, rail normals, slope outlines and the last shot's samples; `preview` a putt's line.
  In a game: `aim` draws the design's aim dial and reach rings around the ball, `aims` the shot
  preview's aim lines, and `camera` zooms onto a point (t = 0: the whole hole, 1: CAMERA_SHARE of it).
-->
<script lang="ts">
  import { HALF, SEGS, segAngle } from '$shared/board'
  import { bounds } from '$shared/minigolf/geometry'
  import { forceArrows, slopeLook } from '$lib/minigolf/terrain'
  import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'
  import { BALL_R, type Hole, type Pt } from '$shared/minigolf/types'

  let {
    hole,
    ball,
    ballColor = '#c6f24e',
    halo = true,
    wallThickness = DEFAULT_PHYSICS.wallThickness,
    onPlace,
    others = [],
    debug = false,
    forces = false,
    lastPath = null,
    preview = null,
    aim = null,
    aims = [],
    camera = null,
  }: {
    hole: Hole
    ball: Pt
    /** The putter's colour: its ball and halo (lime on the bench). */
    ballColor?: string
    /** The ring that keeps a resting ball findable; off while it rolls. */
    halo?: boolean
    wallThickness?: number
    /** Set to let the ball be dragged; called with each new spot in course space. */
    onPlace?: (at: Pt) => void
    /** Other players' balls, drawn faded with their initial. */
    others?: { seat: number; at: Pt; label: string; color?: string }[]
    debug?: boolean
    /** Bench aid: arrows showing which way and how hard the slopes push. */
    forces?: boolean
    lastPath?: readonly Pt[] | null
    /** The putt the pointer would make: a dashed line as long as it would roll on flat felt. */
    preview?: { from: Pt; dir: Pt; power: number; roll: number } | null
    /** The aim dial and reach rings (flat-felt roll, mm, for a treble and a double) around `at`. */
    aim?: { at: Pt; treble: number; double: number } | null
    /** Shot preview aim lines; the current try's is bright, replaced ones faint. */
    aims?: { from: Pt; dir: Pt; roll: number; current: boolean }[]
    camera?: { focus: Pt; t: number } | null
  } = $props()

  /** Each rail segment's midpoint and a short tick along its normal. */
  const normals = $derived(
    [{ points: hole.outline, closed: true }, ...hole.walls].flatMap(w => {
      const n = w.points.length
      const segs = w.closed ? n : n - 1
      return Array.from({ length: segs }, (_, i) => {
        const a = w.points[i]
        const b = w.points[(i + 1) % n]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const end: Pt = [mid[0] - ((b[1] - a[1]) / len) * 60, mid[1] + ((b[0] - a[0]) / len) * 60]
        return { mid, end }
      })
    }),
  )

  let svg = $state<SVGSVGElement>()
  let dragging = $state(false)

  function toCourse(e: PointerEvent): Pt | null {
    const m = svg?.getScreenCTM()
    if (!svg || !m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [Math.round(p.x), Math.round(p.y)]
  }
  function dragStart(e: PointerEvent): void {
    if (!onPlace) return
    e.preventDefault()
    if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId)
    dragging = true
  }
  function dragMove(e: PointerEvent): void {
    if (!dragging || !onPlace) return
    const at = toCourse(e)
    if (at) onPlace(at)
  }

  const PAD = 120
  const box = $derived(bounds(hole.outline))
  const full = $derived({ x: box.minX - PAD, y: box.minY - PAD, w: box.maxX - box.minX + 2 * PAD, h: box.maxY - box.minY + 2 * PAD })
  /** How much of the hole the camera shows zoomed in: enough around the ball to follow it. */
  const CAMERA_SHARE = 0.45
  /** The whole hole, or with `camera` a box CAMERA_SHARE its size around the focus (kept on the hole). */
  const view = $derived.by(() => {
    if (!camera || camera.t <= 0) return full
    const w = full.w * CAMERA_SHARE
    const h = full.h * CAMERA_SHARE
    const x = Math.min(full.x + full.w - w, Math.max(full.x, camera.focus[0] - w / 2))
    const y = Math.min(full.y + full.h - h, Math.max(full.y, camera.focus[1] - h / 2))
    const t = camera.t
    return { x: full.x + (x - full.x) * t, y: full.y + (y - full.y) * t, w: full.w + (w - full.w) * t, h: full.h + (h - full.h) * t }
  })
  const viewBox = $derived(`${view.x} ${view.y} ${view.w} ${view.h}`)

  // The aim dial keeps its size on screen: a share of the hole's view
  const dial = $derived(Math.max(full.w, full.h) * 0.06)
  /** A point at `len` from `at` in board direction `a` (radians, y up, 0 = right). */
  const toward = (at: Pt, a: number, len: number): Pt => [at[0] + Math.cos(a) * len, at[1] - Math.sin(a) * len]
  const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ')
  const looks = $derived(hole.slopes.map(slopeLook))
  const uid = $props.id()
  const arrows = $derived(forces ? forceArrows(hole, 150) : [])
</script>

<svg
  bind:this={svg}
  {viewBox}
  class="block w-full h-full touch-none"
  role="img"
  aria-label="Hole {hole.name}, par {hole.par}"
  data-testid="hole-view"
>
  <defs>
    <pattern id="mg-felt" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="56" height="56" fill="#2a7045" />
      <rect width="28" height="56" fill="#2e784a" />
    </pattern>
    <marker id="{uid}-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto">
      <path d="M0 0 L10 5 L0 10 z" fill="#4ec6f2" />
    </marker>
    <clipPath id="{uid}-course"><polygon points={pts(hole.outline)} /></clipPath>
  </defs>
  <polygon
    points={pts(hole.outline)}
    fill="#050604"
    opacity="0.7"
    transform="translate(0 16)"
    stroke="#050604"
    stroke-width={wallThickness + 16}
    stroke-linejoin="round"
  />
  <polygon points={pts(hole.outline)} fill="url(#mg-felt)" stroke="#e9dfc4" stroke-width={wallThickness} stroke-linejoin="round" />
  <!-- Slopes: lighter the higher (a hill, a bump), darker the deeper (a bowl), fading into the felt at the edge and cut off at the rails -->
  {#each looks as look, i (i)}
    <g pointer-events="none" clip-path="url(#{uid}-course)" data-testid="slope">
      {#each look.bands as d, k (k)}<path {d} fill={look.raised ? '#ffffff' : '#000000'} fill-opacity={look.raised ? 0.03 : 0.045} />{/each}
      <g fill="none" stroke="#e9dfc4" stroke-opacity="0.2" stroke-width="5">
        {#each look.contours as d, k (k)}<path {d} />{/each}
      </g>
    </g>
  {/each}
  {#each hole.walls as w, i (i)}
    {#if w.closed}
      <polygon points={pts(w.points)} fill="#e9dfc4" stroke="#e9dfc4" stroke-width={wallThickness} stroke-linejoin="round" />
    {:else}
      <polyline
        points={pts(w.points)}
        fill="none"
        stroke="#e9dfc4"
        stroke-width={wallThickness}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {/if}
  {/each}
  {#each hole.bumpers as b, i (i)}
    <circle cx={b.at[0]} cy={b.at[1]} r={b.r} fill="#d23b36" stroke="#6e1b18" stroke-width="6" />
  {/each}
  <rect
    x={hole.tee[0] - 70}
    y={hole.tee[1] - 70}
    width="140"
    height="140"
    rx="14"
    fill="#1f5134"
    stroke="#e9dfc4"
    stroke-opacity="0.35"
    stroke-dasharray="8 8"
  />
  <circle cx={hole.cup.at[0]} cy={hole.cup.at[1]} r={hole.cup.r + 12} fill="#1f5134" opacity="0.8" />
  <circle cx={hole.cup.at[0]} cy={hole.cup.at[1]} r={hole.cup.r} fill="#050604" />
  <line
    x1={hole.cup.at[0]}
    y1={hole.cup.at[1]}
    x2={hole.cup.at[0]}
    y2={hole.cup.at[1] - 240}
    stroke="#efeee6"
    stroke-width="8"
    stroke-linecap="round"
  />
  <path d="M{hole.cup.at[0]} {hole.cup.at[1] - 240} l110 34 l-110 34 z" fill="#c6f24e" stroke="#0a0b09" stroke-width="4" />
  {#if arrows.length}
    <g pointer-events="none" stroke="#4ec6f2" stroke-width="8" stroke-linecap="round" data-testid="force-arrows">
      {#each arrows as { at, end }, i (i)}
        <line x1={at[0]} y1={at[1]} x2={end[0]} y2={end[1]} marker-end="url(#{uid}-head)" />
      {/each}
    </g>
  {/if}
  {#if debug}
    <g pointer-events="none" data-testid="debug-overlay">
      {#each looks as look, i (i)}
        <path d={look.bands[0]} fill="none" stroke="#e9dfc4" stroke-dasharray="16 12" stroke-width="4" />
      {/each}
      {#each normals as n, i (i)}
        <line x1={n.mid[0]} y1={n.mid[1]} x2={n.end[0]} y2={n.end[1]} stroke="#4ec6f2" stroke-width="6" stroke-linecap="round" />
      {/each}
      <circle cx={hole.cup.at[0]} cy={hole.cup.at[1]} r={hole.cup.r} fill="none" stroke="#4ec6f2" stroke-dasharray="8 6" stroke-width="4" />
      {#if lastPath}
        <polyline points={pts(lastPath)} fill="none" stroke="#c6f24e" stroke-opacity="0.6" stroke-width="5" />
        {#each lastPath as p, i (i)}<circle cx={p[0]} cy={p[1]} r="5" fill="#c6f24e" />{/each}
      {/if}
    </g>
  {/if}
  {#if preview}
    {@const end = [preview.from[0] + preview.dir[0] * preview.roll, preview.from[1] + preview.dir[1] * preview.roll]}
    <g pointer-events="none" data-testid="shot-preview">
      <line
        x1={preview.from[0]}
        y1={preview.from[1]}
        x2={end[0]}
        y2={end[1]}
        stroke="#c6f24e"
        stroke-width="8"
        stroke-dasharray="18 12"
        stroke-linecap="round"
      />
      <text
        x={end[0] + 24}
        y={end[1]}
        fill="#efeee6"
        font-size="64"
        font-weight="700"
        stroke="#0a0b09"
        stroke-width="10"
        paint-order="stroke"
      >
        {Math.round(preview.power * 100)}%
      </text>
    </g>
  {/if}
  {#each others as o (o.seat)}
    <g opacity="0.8" pointer-events="none" data-testid="other-ball">
      <circle cx={o.at[0]} cy={o.at[1]} r={BALL_R} fill={o.color ?? '#efeee6'} stroke="#0a0b09" stroke-width="5" />
      <text
        x={o.at[0]}
        y={o.at[1] - BALL_R - 14}
        fill="#efeee6"
        font-size="52"
        font-weight="700"
        text-anchor="middle"
        stroke="#0a0b09"
        stroke-width="8"
        paint-order="stroke">{o.label}</text
      >
    </g>
  {/each}
  {#each aims as line, i (i)}
    {@const end = [line.from[0] + line.dir[0] * line.roll, line.from[1] + line.dir[1] * line.roll]}
    <line
      x1={line.from[0]}
      y1={line.from[1]}
      x2={end[0]}
      y2={end[1]}
      stroke="#c6f24e"
      stroke-opacity={line.current ? 0.9 : 0.3}
      stroke-width={dial * 0.06}
      stroke-dasharray="{dial * 0.18} {dial * 0.12}"
      stroke-linecap="round"
      pointer-events="none"
      data-testid="shot-preview-line"
    />
  {/each}
  {#if aim}
    <g pointer-events="none" data-testid="aim-overlay">
      {#each [{ r: aim.treble, label: 'TREBLE' }, { r: aim.double, label: 'DOUBLE · MAX' }] as ring (ring.label)}
        {@const tag = toward(aim.at, (3 * Math.PI) / 4, ring.r)}
        <circle
          cx={aim.at[0]}
          cy={aim.at[1]}
          r={ring.r}
          fill="none"
          stroke="#efeee6"
          stroke-opacity="0.32"
          stroke-width={dial * 0.03}
          stroke-dasharray="{dial * 0.12} {dial * 0.12}"
        />
        <text x={tag[0]} y={tag[1]} fill="#efeee6" fill-opacity="0.75" font-size={dial * 0.24} font-weight="700" text-anchor="end"
          >{ring.label}</text
        >
      {/each}
      <circle
        cx={aim.at[0]}
        cy={aim.at[1]}
        r={dial}
        fill="#0f100e"
        fill-opacity="0.62"
        stroke="#efeee6"
        stroke-opacity="0.55"
        stroke-width={dial * 0.03}
      />
      {#each SEGS as n, i (n)}
        {@const a = segAngle(i)}
        {@const from = toward(aim.at, a + HALF, dial * 0.3)}
        {@const to = toward(aim.at, a + HALF, dial)}
        {@const label = toward(aim.at, a, dial * 1.36)}
        <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#efeee6" stroke-opacity="0.35" stroke-width={dial * 0.02} />
        <text
          x={label[0]}
          y={label[1]}
          fill="#efeee6"
          font-size={dial * 0.3}
          font-weight="700"
          text-anchor="middle"
          dominant-baseline="central"
          stroke="#0a0b09"
          stroke-width={dial * 0.07}
          paint-order="stroke">{n}</text
        >
      {/each}
    </g>
  {/if}
  {#if onPlace}
    <circle
      cx={ball[0]}
      cy={ball[1]}
      r={BALL_R * 3}
      fill="#c6f24e"
      fill-opacity="0.15"
      stroke="#c6f24e"
      stroke-dasharray="10 8"
      stroke-width="4"
    />
  {/if}
  <circle
    cx={ball[0]}
    cy={ball[1]}
    r={onPlace ? BALL_R * 3 : BALL_R}
    fill="transparent"
    class={onPlace ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}
    onpointerdown={dragStart}
    onpointermove={dragMove}
    onpointerup={() => (dragging = false)}
    onpointercancel={() => (dragging = false)}
    role="presentation"
  />
  <!-- The ball is true to scale (4.3 cm): a halo keeps it findable from across the room -->
  {#if halo}
    <circle cx={ball[0]} cy={ball[1]} r={BALL_R * 2.6} fill={ballColor} fill-opacity="0.22" pointer-events="none" />
  {/if}
  <circle
    cx={ball[0]}
    cy={ball[1]}
    r={BALL_R}
    fill={ballColor}
    stroke="#0a0b09"
    stroke-width="5"
    pointer-events="none"
    data-testid="ball"
  />
</svg>
