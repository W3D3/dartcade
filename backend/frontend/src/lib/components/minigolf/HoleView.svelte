<!--
  A minigolf hole drawn in course space (mm, y down) in the design's look (Minigolf.dc.html):
  felt, cream rails, red bumpers, slopes with arrows along their push, the tee, the cup and flag,
  and the ball. With `onPlace`, the ball can be dragged anywhere. Bench aids: `debug` draws the cup's
  capture radius, rail normals, slope outlines and the last shot's samples; `preview` a putt's line.
-->
<script lang="ts">
  import { bounds } from '$shared/minigolf/geometry'
  import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'
  import { BALL_R, type Hole, type Pt } from '$shared/minigolf/types'

  let {
    hole,
    ball,
    wallThickness = DEFAULT_PHYSICS.wallThickness,
    onPlace,
    others = [],
    debug = false,
    lastPath = null,
    preview = null,
  }: {
    hole: Hole
    ball: Pt
    wallThickness?: number
    /** Set to let the ball be dragged; called with each new spot in course space. */
    onPlace?: (at: Pt) => void
    /** Other players' balls, drawn faded with their initial. */
    others?: { seat: number; at: Pt; label: string }[]
    debug?: boolean
    lastPath?: readonly Pt[] | null
    /** The putt the pointer would make: a dashed line as long as it would roll on flat felt. */
    preview?: { from: Pt; dir: Pt; power: number; roll: number } | null
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
  const viewBox = $derived(`${box.minX - PAD} ${box.minY - PAD} ${box.maxX - box.minX + 2 * PAD} ${box.maxY - box.minY + 2 * PAD}`)
  const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ')
  const centroid = (p: readonly Pt[]): Pt => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]

  /** A 180 mm arrow centred on `at`, pointing along `dir`. */
  function arrow(at: Pt, dir: Pt): string {
    const len = Math.hypot(dir[0], dir[1]) || 1
    const ux = dir[0] / len
    const uy = dir[1] / len
    const tip: Pt = [at[0] + ux * 90, at[1] + uy * 90]
    const back: Pt = [tip[0] - ux * 40, tip[1] - uy * 40]
    return (
      `M${at[0] - ux * 90} ${at[1] - uy * 90} L${tip[0]} ${tip[1]} ` +
      `M${back[0] - uy * 40} ${back[1] + ux * 40} L${tip[0]} ${tip[1]} L${back[0] + uy * 40} ${back[1] - ux * 40}`
    )
  }

  /** Arrows around a radial slope's centre: outward for a summit, inward for a bowl. */
  function radialArrows(center: Pt, strength: number): string[] {
    const s = Math.sign(strength) || 1
    return [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ].map(([dx, dy]) => arrow([center[0] + dx * 200, center[1] + dy * 200], [dx * s, dy * s]))
  }
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
  {#each hole.slopes as s, i (i)}
    <polygon points={pts(s.area)} fill="#e9dfc4" fill-opacity="0.07" />
    {#each 'force' in s ? [arrow(centroid(s.area), s.force)] : radialArrows(s.radial.center, s.radial.strength) as d, k (k)}
      <path {d} fill="none" stroke="#e9dfc4" stroke-opacity="0.32" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
    {/each}
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
  {#if debug}
    <g pointer-events="none" data-testid="debug-overlay">
      {#each hole.slopes as sl, i (i)}
        <polygon points={pts(sl.area)} fill="none" stroke="#e9dfc4" stroke-dasharray="16 12" stroke-width="4" />
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
    <g opacity="0.55" pointer-events="none" data-testid="other-ball">
      <circle cx={o.at[0]} cy={o.at[1]} r={BALL_R} fill="#efeee6" stroke="#0a0b09" stroke-width="5" />
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
  <circle cx={ball[0]} cy={ball[1]} r={BALL_R * 2.6} fill="#c6f24e" fill-opacity="0.18" pointer-events="none" />
  <circle cx={ball[0]} cy={ball[1]} r={BALL_R} fill="#c6f24e" stroke="#0a0b09" stroke-width="5" pointer-events="none" data-testid="ball" />
</svg>
