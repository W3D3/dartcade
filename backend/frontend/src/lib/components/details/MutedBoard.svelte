<script lang="ts">
  // The muted dartboard the details heatmap and the coach draw on, in the BOARD_VIEW_HALF box
  // (1 unit = 1 mm). Overlays go in `children`, in the same coordinates. `onpoint` reports a
  // click's board point in board units (y up, r = 1 at the double wire).
  import type { Snippet } from 'svelte'
  import { BOARD_VIEW_HALF, fromBoardPx } from '../../details/heatmap.js'
  import { BULL25_PX, BULL50_PX, boardNumbers, boardSegments } from '../../details/boardGeometry.js'

  let {
    label,
    class: cls = '',
    onpoint,
    children,
  }: { label: string; class?: string; onpoint?: (p: { x: number; y: number }) => void; children?: Snippet } = $props()

  const segments = boardSegments()
  const numbers = boardNumbers()
  const VIEW = BOARD_VIEW_HALF
  const viewBox = `-${VIEW} -${VIEW} ${VIEW * 2} ${VIEW * 2}`

  /** A ring's fill, one surface tone lighter for the treble/double rings than that segment's
   *  own single-ring tone (odd segments one step up the ramp, even segments the next). */
  function ringFillClass(ring: 'single' | 'treble' | 'double', odd: boolean): string {
    if (ring === 'single') return odd ? 'fill-surface-chip' : 'fill-surface-active'
    return odd ? 'fill-surface-key' : 'fill-surface-chip'
  }

  function click(e: MouseEvent & { currentTarget: SVGSVGElement }) {
    const ctm = e.currentTarget.getScreenCTM()
    if (!onpoint || !ctm) return
    onpoint(fromBoardPx(new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())))
  }
</script>

<!-- Pointer-only when clickable, as the match screen's DartBoard: a click places a dart where it landed -->
<svg {viewBox} role={onpoint ? 'application' : 'img'} aria-label={label} class={cls} onclick={onpoint ? click : undefined}>
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
  {@render children?.()}
</svg>
