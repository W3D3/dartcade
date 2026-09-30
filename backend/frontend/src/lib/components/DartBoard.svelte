<script lang="ts">
  import type { Snippet } from 'svelte'
  import { labelPos } from '$lib/dartUtils.js'

  type Segment = { name: string; number: number; bed: string; multiplier: number }

  let { darts = [], selectedSegments = [], playerMarkers = [], checkoutTargets = [], onSegmentClick,
        onBoardClick, selectedDart = null, onDartMove, zoom = 1, overlay }: {
    darts?: Array<{
      segment: { number: number; bed: string; multiplier: number; name: string }
      score: number
      coords?: { x: number; y: number }
    }>
    selectedSegments?: number[]
    playerMarkers?: Array<{ initial: string; segment: number; isActive: boolean }>
    checkoutTargets?: string[]
    onSegmentClick?: (seg: Segment) => void
    /** Click anywhere on the board: the exact spot (r = 1 at the outer double wire, y up)
     *  and the segment under it. Takes precedence over onSegmentClick. */
    onBoardClick?: (hit: { segment: Segment; coords: { x: number; y: number } }) => void
    /** Index into `darts` of the dart picked for correction; it is highlighted. */
    selectedDart?: number | null
    /** A dart was dragged to a new spot (any dart can be dragged while this is set). */
    onDartMove?: (index: number, hit: { segment: Segment; coords: { x: number; y: number } }) => void
    /** Magnification around the bull (1 = whole board); changes animate. */
    zoom?: number
    /** Extra marks drawn in board units (r = 1 at the outer double wire), zoomed with the board.
     *  Receives the zoom factor so marks can keep a constant on-screen size. */
    overlay?: Snippet<[number]>
  } = $props()

  const R = { bull50: 0.037, bull25: 0.094, si: 0.582, tr: 0.629, so: 0.953, db: 1.000 }
  const SEGS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5]
  const HALF = Math.PI / 20

  const RING_BED: Record<string, { bed: string; multiplier: number }> = {
    si: { bed: 'SingleOuter', multiplier: 1 },
    tr: { bed: 'Triple',      multiplier: 3 },
    so: { bed: 'SingleOuter', multiplier: 1 },
    db: { bed: 'Double',      multiplier: 2 },
  }

  function segAngle(i: number) { return Math.PI / 2 - i * 2 * HALF }

  function sectorPath(r1: number, r2: number, a1: number, a2: number) {
    const [c1,s1,c2,s2] = [Math.cos(a1),Math.sin(a1),Math.cos(a2),Math.sin(a2)]
    return `M${r1*c1} ${-r1*s1} L${r2*c1} ${-r2*s1} A${r2} ${r2} 0 0 1 ${r2*c2} ${-r2*s2} L${r1*c2} ${-r1*s2} A${r1} ${r1} 0 0 0 ${r1*c1} ${-r1*s1}Z`
  }

  function ringColor(i: number, ring: string) {
    const ev = i % 2 === 0
    if (ring === 'tr' || ring === 'db') return ev ? '#d23b36' : '#1e7a4f'
    return ev ? '#1a1a17' : '#e9dfc4'
  }

  const sectors = SEGS.map((num, i) => {
    const c = segAngle(i), a1 = c + HALF, a2 = c - HALF
    return {
      num, i, a1, a2,
      paths: [
        { ring: 'si', d: sectorPath(R.bull25, R.si, a1, a2) },
        { ring: 'tr', d: sectorPath(R.si, R.tr, a1, a2) },
        { ring: 'so', d: sectorPath(R.tr, R.so, a1, a2) },
        { ring: 'db', d: sectorPath(R.so, R.db, a1, a2) },
      ],
      tx: Math.cos(c) * 1.06,
      ty: -Math.sin(c) * 1.06,
      wa: c + HALF,
    }
  })

  function clickSegment(num: number, ring: string) {
    if (!onSegmentClick) return
    const { bed, multiplier } = RING_BED[ring]
    const mult = multiplier as 1 | 2 | 3
    const name = mult === 3 ? `T${num}` : mult === 2 ? `D${num}` : `S${num}`
    onSegmentClick({ name, number: num, bed, multiplier: mult })
  }

  function dartPos(dart: typeof darts[0]): { x: number; y: number } | null {
    if (dart.coords) return dart.coords
    const { bed, number } = dart.segment
    if (bed === 'Outside') return null
    if (number === 25) return { x: 0, y: (R.bull50 + R.bull25) / 2 }
    if (number === 50) return { x: 0, y: R.bull50 / 2 }
    const si = SEGS.indexOf(number)
    if (si < 0) return null
    const a = segAngle(si)
    const r = bed === 'SingleInner' ? (R.bull25 + R.si) / 2
            : bed === 'Triple'      ? (R.si + R.tr) / 2
            : bed === 'Double'      ? (R.so + R.db) / 2
            :                         (R.tr + R.so) / 2
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  }

  function markerPos(segNum: number): { x: number; y: number } | null {
    if (segNum === 25 || segNum === 50) return { x: 0, y: 0 }
    const si = SEGS.indexOf(segNum)
    if (si < 0) return null
    const a = segAngle(si)
    const r = (R.tr + R.so) / 2
    return { x: r * Math.cos(a), y: -r * Math.sin(a) }
  }

  /** The segment at a point in board units (y up), as Board Manager would name it. */
  function segmentAt(x: number, y: number): Segment {
    const r = Math.hypot(x, y)
    if (r <= R.bull50) return { name: 'Bull', number: 50, bed: 'Double', multiplier: 1 }
    if (r <= R.bull25) return { name: '25', number: 25, bed: 'Single', multiplier: 1 }
    // Sector 0 (20) is centred on +y; sectors run clockwise
    const cw = (Math.PI / 2 - Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI)
    const num = SEGS[Math.round(cw / (2 * HALF)) % 20]
    // Just off the board: a near miss next to that number
    if (r > R.db) return { name: `M${num}`, number: num, bed: 'Outside', multiplier: 0 }
    const ring = r <= R.si ? 'si' : r <= R.tr ? 'tr' : r <= R.so ? 'so' : 'db'
    const { bed, multiplier } = RING_BED[ring]
    const name = multiplier === 3 ? `T${num}` : multiplier === 2 ? `D${num}` : `S${num}`
    return { name, number: num, bed, multiplier }
  }

  let svgEl: SVGSVGElement

  /** Pointer position in board units: zoom undone, y up like camera coords. */
  function toBoard(e: MouseEvent): { x: number; y: number } | null {
    const ctm = svgEl.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x / zoom, y: -p.y / zoom }
  }

  function boardClick(e: MouseEvent) {
    // The click that ends a drag is not a new dart
    if (!onBoardClick || justDragged) { justDragged = false; return }
    const c = toBoard(e)
    if (c) onBoardClick({ segment: segmentAt(c.x, c.y), coords: c })
  }

  // Dragging the selected dart: preview where it goes, report the drop
  let drag = $state<{ index: number; from: { x: number; y: number }; at: { x: number; y: number } } | null>(null)
  let justDragged = false
  const canDrag = (_i: number) => !!onDartMove

  function dragStart(e: PointerEvent, i: number) {
    if (!canDrag(i)) return
    const c = toBoard(e)
    if (!c) return
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag = { index: i, from: c, at: c }
  }
  function dragMove(e: PointerEvent) {
    if (!drag) return
    const c = toBoard(e)
    if (c) drag = { ...drag, at: c }
  }
  function dragEnd(e: PointerEvent) {
    if (!drag) return
    const { index, from } = drag
    const c = toBoard(e) ?? drag.at
    drag = null
    // A tap without moving is an ordinary click (it may place a new dart)
    if (Math.hypot(c.x - from.x, c.y - from.y) < 0.01) return
    justDragged = true
    setTimeout(() => { justDragged = false })
    onDartMove?.(index, { segment: segmentAt(c.x, c.y), coords: c })
  }

  const DOT_COLORS = ['#c6f24e', '#c6f24e', '#c6f24e']
  const DOT_STROKE = '#0f100e'
  // Zoomed content is clipped to the board's round background
  const uid = $props.id()
  const clipId = `board-clip-${uid}`

  const precise = $derived(!!onBoardClick)
  const interactive = $derived(!precise && !!onSegmentClick)
  // Either way, light up the segment under the cursor
  const hoverable = $derived(interactive || precise)
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<svg bind:this={svgEl} viewBox="-1.15 -1.15 2.3 2.3" class="w-full {hoverable ? 'cursor-crosshair' : ''}"
  xmlns="http://www.w3.org/2000/svg" onclick={precise ? boardClick : undefined}>
  <defs><clipPath id={clipId}><circle cx="0" cy="0" r="1.12" /></clipPath></defs>
  <circle cx="0" cy="0" r="1.12" fill="#0a0b09" />

  <g clip-path="url(#{clipId})">
  <g style="transform: scale({zoom}); transition: transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)">
  <!-- Sector fills and wire dividers -->
  {#each sectors as { num, i, paths, wa }}
    {#each paths as { ring, d }}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <path {d} fill={ringColor(i, ring)} stroke="#8d8e84" stroke-width="1" vector-effect="non-scaling-stroke"
        onclick={interactive ? () => clickSegment(num, ring) : undefined}
        class={hoverable ? 'hover:brightness-125' : ''} />
    {/each}
    <line
      x1={R.bull25 * Math.cos(wa)} y1={-R.bull25 * Math.sin(wa)}
      x2={R.db * Math.cos(wa)} y2={-R.db * Math.sin(wa)}
      stroke="#8d8e84" stroke-width="1.2" vector-effect="non-scaling-stroke"
    />
  {/each}

  <!-- Ring wire circles -->
  {#each [R.bull25, R.si, R.tr, R.so, R.db] as r}
    <circle cx="0" cy="0" {r} fill="none" stroke="#8d8e84" stroke-width="1.2" vector-effect="non-scaling-stroke" />
  {/each}

  <!-- Bull fills -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <circle cx="0" cy="0" r={R.bull25} fill="#1e7a4f" stroke="#8d8e84" stroke-width="1.2" vector-effect="non-scaling-stroke"
    onclick={interactive ? () => onSegmentClick?.({ name: '25', number: 25, bed: 'Single', multiplier: 1 }) : undefined}
    class={hoverable ? 'hover:brightness-125' : ''} />
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <circle cx="0" cy="0" r={R.bull50} fill="#d23b36" stroke="#8d8e84" stroke-width="1.2" vector-effect="non-scaling-stroke"
    onclick={interactive ? () => onSegmentClick?.({ name: 'Bull', number: 50, bed: 'Double', multiplier: 1 }) : undefined}
    class={hoverable ? 'hover:brightness-125' : ''} />

  <!-- Selected segment: lime wedge overlay -->
  {#each sectors as { num, a1, a2 }}
    {#if selectedSegments.includes(num)}
      <path d={sectorPath(R.bull25, R.db, a1, a2)}
        fill="#c6f24e" fill-opacity="0.22"
        stroke="#c6f24e" stroke-width="0.016" stroke-linejoin="round"
        style="pointer-events:none" />
    {/if}
  {/each}

  <!-- Selected bull overlays -->
  {#if selectedSegments.includes(25)}
    <circle cx="0" cy="0" r={R.bull25}
      fill="#c6f24e" fill-opacity="0.28" stroke="#c6f24e" stroke-width="0.016"
      style="pointer-events:none" />
  {/if}
  {#if selectedSegments.includes(50)}
    <circle cx="0" cy="0" r={R.bull50}
      fill="#c6f24e" fill-opacity="0.45" stroke="#c6f24e" stroke-width="0.016"
      style="pointer-events:none" />
  {/if}

  <!-- Number labels — pointer-events:none so clicks go through to paths -->
  {#each sectors as { num, tx, ty }}
    <text x={tx} y={ty} text-anchor="middle" dominant-baseline="central"
      fill={selectedSegments.includes(num) ? '#c6f24e' : '#efeee6'}
      font-size={selectedSegments.includes(num) ? '0.105' : '0.09'}
      font-family="Barlow Condensed, sans-serif" font-weight="bold"
      style="pointer-events:none">
      {num}
    </text>
  {/each}

  <!-- Other-player markers: white circle with initial -->
  {#each playerMarkers.filter(m => !m.isActive) as marker}
    {@const pos = markerPos(marker.segment)}
    {#if pos}
      <circle cx={pos.x} cy={pos.y} r="0.085"
        fill="white" stroke="#0a0b09" stroke-width="0.01"
        style="pointer-events:none" />
      <text x={pos.x} y={pos.y} text-anchor="middle" dominant-baseline="central"
        fill="#0a0b09" font-size="0.072" font-family="Barlow Condensed, sans-serif" font-weight="bold"
        style="pointer-events:none">
        {marker.initial}
      </text>
    {/if}
  {/each}

  <!-- Darts -->
  {#each darts as dart, i}
    {@const pos = drag?.index === i ? drag.at : dartPos(dart)}
    {@const selected = selectedDart === i}
    {#if pos}
      <!-- The segment label only shows while the dart is hovered, selected or dragged -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g class="group {canDrag(i) ? (drag ? 'cursor-grabbing' : 'cursor-grab') : ''}"
        style="touch-action:none"
        onpointerdown={e => dragStart(e, i)} onpointermove={dragMove}
        onpointerup={dragEnd} onpointercancel={() => drag = null}>
        {#if selected}
          <circle cx={pos.x} cy={-pos.y} r="0.075" fill="#c6f24e" fill-opacity="0.18"
            stroke="#c6f24e" stroke-width="0.012" stroke-dasharray="0.02 0.015" />
        {/if}
        <circle cx={pos.x} cy={-pos.y} r={selected ? 0.05 : 0.04}
          fill={DOT_COLORS[i % DOT_COLORS.length]} stroke={DOT_STROKE} stroke-width="0.008" />
        <text x={pos.x + 0.06} y={-pos.y} dominant-baseline="central"
          fill="#ffffff" stroke="#000000" stroke-width="0.016" stroke-linejoin="round" paint-order="stroke"
          font-size="0.065" font-family="system-ui,sans-serif" font-weight="bold"
          class="{selected ? '' : 'opacity-0'} group-hover:opacity-100 transition-opacity" style="pointer-events:none">
          {drag?.index === i ? segmentAt(drag.at.x, drag.at.y).name : dart.segment.name}
        </text>
      </g>
    {:else}
      <text x={-0.15 + i * 0.14} y="1.05" text-anchor="middle" dominant-baseline="central"
        fill="#c6f24e" font-size="0.1" font-family="Barlow Condensed, sans-serif"
        style="pointer-events:none">✕</text>
    {/if}
  {/each}

  <!-- Checkout target dashed circles (x01) -->
  {#each checkoutTargets as label}
    {@const pos = labelPos(label)}
    {#if pos}
      <circle cx={pos.x} cy={pos.y} r="0.055"
        fill="none" stroke="#c6f24e" stroke-width="0.018" stroke-dasharray="0.025 0.02"
        style="pointer-events:none" />
    {/if}
  {/each}

  <!-- Overlay marks are informational: clicks go through to the segments -->
  <g style="pointer-events:none">{@render overlay?.(zoom)}</g>
  </g>
  </g>
</svg>
