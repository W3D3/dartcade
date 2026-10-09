<!--
  A minigolf hole drawn in course space (mm, y down) in the design's look (Minigolf.dc.html):
  felt, cream rails, red bumpers, slopes with arrows along their push, the tee, the cup and flag,
  and the ball. With `onPlace`, the ball can be dragged anywhere.
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
  }: {
    hole: Hole
    ball: Pt
    wallThickness?: number
    /** Set to let the ball be dragged; called with each new spot in course space. */
    onPlace?: (at: Pt) => void
  } = $props()

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
  <circle cx={ball[0]} cy={ball[1]} r={BALL_R} fill="#c6f24e" stroke="#0a0b09" stroke-width="5" pointer-events="none" data-testid="ball" />
</svg>
