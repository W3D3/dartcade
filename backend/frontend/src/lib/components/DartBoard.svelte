<script lang="ts">
  import {
    AIM_EDGE_SPEED,
    AIM_HOLD_MS,
    AIM_OFFSET_PX,
    AIM_ZOOM,
    aimOffsetFor,
    edgePush,
    moveAim,
    shownAt,
    viewBoxFor,
    type Pt,
  } from '$lib/boardAim'
  import { untrack, type Snippet } from 'svelte'
  import { markerPositions, parseLabel } from '$lib/dartUtils.js'
  import { R, SEGS, HALF, segAngle, segmentAt } from '$shared/board.js'
  import type { Segment } from '$lib/api/game-ws'

  let {
    darts = [],
    target = null,
    nextTarget = null,
    dim = false,
    playerMarkers = [],
    checkoutTargets = [],
    onBoardClick,
    onBoardHover,
    selectedDart = null,
    onDartMove,
    zoom = 1,
    overlay,
    cameraSrc = null,
  }: {
    darts?: Array<{
      segment: Segment
      score: number
      coords?: { x: number; y: number }
    }>
    /** ATC target of the thrower: lime wedge (1–20) or bull ring (25, 50). */
    target?: number | null
    /** ATC target of the next player: white dashed outline. */
    nextTarget?: number | null
    /** Dim the board so the target stands out (ATC). */
    dim?: boolean
    playerMarkers?: Array<{ initial: string; segment: number; isActive: boolean }>
    checkoutTargets?: string[]
    /** Click anywhere on the board: the exact spot (r = 1 at the outer double wire, y up)
     *  and the segment under it. */
    onBoardClick?: (hit: { segment: Segment; coords: { x: number; y: number } }) => void
    /** The pointer over the board, in the same units as onBoardClick; null when it leaves. */
    onBoardHover?: (coords: { x: number; y: number } | null) => void
    /** Index into `darts` of the dart picked for correction; it is highlighted. */
    selectedDart?: number | null
    /** A dart was dragged to a new spot (any dart can be dragged while this is set). */
    onDartMove?: (index: number, hit: { segment: Segment; coords: { x: number; y: number } }) => void
    /** Magnification around the bull (1 = whole board); changes animate. */
    zoom?: number
    /** Extra marks drawn in board units (r = 1 at the outer double wire), zoomed with the board.
     *  Receives the zoom factor so marks can keep a constant on-screen size. */
    overlay?: Snippet<[number]>
    /** A camera still of the real board, straightened by the Board Manager: square, the bull at
     *  the centre, r = 1 at a third of its width, 20 at the top. Drawn under the marks in place
     *  of the segment fills; null for the drawn board. */
    cameraSrc?: string | null
  } = $props()

  // The still before the current one always stays underneath it: an SVG image paints nothing
  // until it has loaded, so the old picture shows through meanwhile (no empty flash after each
  // dart) and is then covered by the new, opaque one
  let prevSrc = $state<string | null>(null)
  let lastSrc: string | null = untrack(() => cameraSrc)
  $effect.pre(() => {
    if (cameraSrc === lastSrc) return
    prevSrc = cameraSrc === null ? null : lastSrc
    lastSrc = cameraSrc
  })
  const stills = $derived(
    cameraSrc === null ? [] : [prevSrc, cameraSrc].filter((s, i, all): s is string => s !== null && all.indexOf(s) === i),
  )
  // A still that didn't load (e.g. forgotten after its board reconnected): the drawn board shows
  let failedSrc = $state<string | null>(null)
  const photo = $derived(cameraSrc !== null && cameraSrc !== failedSrc)
  // On the photo the wires are only a hint, so they don't hide the real board
  const wireOpacity = $derived(photo ? 0.35 : 1)

  function sectorPath(r1: number, r2: number, a1: number, a2: number) {
    const [c1, s1, c2, s2] = [Math.cos(a1), Math.sin(a1), Math.cos(a2), Math.sin(a2)]
    return `M${r1 * c1} ${-r1 * s1} L${r2 * c1} ${-r2 * s1} A${r2} ${r2} 0 0 1 ${r2 * c2} ${-r2 * s2} L${r1 * c2} ${-r1 * s2} A${r1} ${r1} 0 0 0 ${r1 * c1} ${-r1 * s1}Z`
  }

  /** The wedge (or bull ring) a suggested checkout target highlights, in board units. */
  function checkoutHighlight(label: string): { wedge: string } | { bull: number } | null {
    if (label === 'Miss') return null
    if (label === 'Bull') return { bull: R.bull50 }
    if (label === '25') return { bull: R.bull25 }
    const { mult, num } = parseLabel(label)
    const si = SEGS.indexOf(num)
    if (si < 0) return null
    const a = segAngle(si)
    const [r1, r2] = mult === 3 ? [R.si, R.tr] : mult === 2 ? [R.so, R.db] : [R.tr, R.so]
    return { wedge: sectorPath(r1, r2, a + HALF, a - HALF) }
  }

  function ringColor(i: number, ring: string) {
    const ev = i % 2 === 0
    if (ring === 'tr' || ring === 'db') return ev ? '#d23b36' : '#1e7a4f'
    return ev ? '#1a1a17' : '#e9dfc4'
  }

  const sectors = SEGS.map((num, i) => {
    const c = segAngle(i),
      a1 = c + HALF,
      a2 = c - HALF
    return {
      num,
      i,
      a1,
      a2,
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

  function dartPos(dart: (typeof darts)[0]): { x: number; y: number } | null {
    if (dart.coords) return dart.coords
    const { bed, number } = dart.segment
    if (number === 25) return { x: 0, y: (R.bull50 + R.bull25) / 2 }
    if (number === 50) return { x: 0, y: R.bull50 / 2 }
    const si = SEGS.indexOf(number)
    if (si < 0) return null
    const a = segAngle(si)
    // A miss (bed 'Outside') has no ring of its own: segmentAt still names the nearby number
    // it landed closest to, so it's placed just past the double wire at that number's angle —
    // not at a fixed spot unrelated to where it actually landed (the fallback below, for a
    // dart this can't resolve a position for at all, isn't that: it has no angle to place at).
    const r =
      bed === 'Outside'
        ? R.db + 0.08
        : bed === 'SingleInner'
          ? (R.bull25 + R.si) / 2
          : bed === 'Triple'
            ? (R.si + R.tr) / 2
            : bed === 'Double'
              ? (R.so + R.db) / 2
              : (R.tr + R.so) / 2
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
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
    // The click that ends a drag or a long-press aim is not a new dart
    if (!onBoardClick || justDragged) {
      justDragged = false
      return
    }
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
    if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId)
    drag = { index: i, from: c, at: c }
  }
  function dragMove(e: PointerEvent) {
    if (!drag || aim) return
    const c = toBoard(e)
    if (c) drag = { ...drag, at: c }
  }
  function dragEnd(e: PointerEvent) {
    if (!drag || aim) return
    const { index, from } = drag
    const c = toBoard(e) ?? drag.at
    drag = null
    // A tap without moving is an ordinary click (it may place a new dart)
    if (Math.hypot(c.x - from.x, c.y - from.y) < 0.01) return
    justDragged = true
    setTimeout(() => {
      justDragged = false
    })
    onDartMove?.(index, { segment: segmentAt(c.x, c.y), coords: c })
  }

  // Long press: zoom in around the spot and aim a little above the finger (see boardAim.ts).
  // A quick tap still places the dart (or starts a drag) as before. The zoom is a viewBox, so
  // nothing on the board is transformed (iOS Safari leaves black trails under transforms).
  const BOX = { half: 1.15, margin: 0.1 }
  let aim = $state<{ at: Pt; finger: Pt; offset: number; dart: number | null } | null>(null)
  let hold: { timer: ReturnType<typeof setTimeout>; start: Pt } | null = null
  let edgeTimer: ReturnType<typeof setInterval> | null = null

  /** Pointer position in unzoomed view units (y down), whatever the current viewBox. */
  function viewPt(e: PointerEvent): Pt | null {
    const r = svgEl.getBoundingClientRect()
    if (!r.width) return null
    return { x: -1.15 + ((e.clientX - r.left) * 2.3) / r.width, y: -1.15 + ((e.clientY - r.top) * 2.3) / r.height }
  }
  const pxPerUnit = () => svgEl.getBoundingClientRect().width / 2.3 || 1
  /** View point → board units (zoom undone, y up). */
  const boardAt = (p: Pt) => ({ x: p.x / zoom, y: -p.y / zoom })
  // The aim can go a little past the board (to cancel), not forever
  const clampAt = (p: Pt) => ({ x: Math.max(-1.4, Math.min(1.4, p.x)), y: Math.max(-1.4, Math.min(1.4, p.y)) })
  const aimed = $derived(aim ? boardAt(aim.at) : null)
  const shown = $derived(aim ? shownAt(aim.finger, aim.offset, BOX) : null)
  const zoomBox = $derived(aim && shown ? viewBoxFor(aim.at, shown, AIM_ZOOM, BOX.half) : null)
  // Off the board's round background: lifting there places nothing
  const aimOff = $derived(aimed !== null && Math.hypot(aimed.x, aimed.y) > 1.12)

  function cancelHold() {
    if (hold) clearTimeout(hold.timer)
    hold = null
  }
  function stopAim() {
    if (edgeTimer) clearInterval(edgeTimer)
    edgeTimer = null
    aim = null
  }
  // Held past the edge of the board area, the board keeps scrolling that way
  function edgeTick() {
    if (!aim) return
    const push = edgePush(aim.finger, aim.offset, BOX)
    if (!push.x && !push.y) return
    const step = AIM_EDGE_SPEED * 0.016
    aim = { ...aim, at: clampAt({ x: aim.at.x + push.x * step, y: aim.at.y + push.y * step }) }
  }
  function pressStart(e: PointerEvent) {
    if (!onBoardClick && !drag) return
    const start = viewPt(e)
    if (!start) return
    // A press on a thrown dart (dragStart ran first) zooms to move that dart
    const dart = drag?.index ?? null
    // Only a touch needs the aim lifted off the finger; a mouse or pen points right at the spot
    const offset = aimOffsetFor(e.pointerType, AIM_OFFSET_PX)
    cancelHold()
    hold = {
      start,
      timer: setTimeout(() => {
        hold = null
        aim = { at: start, finger: start, offset: offset / pxPerUnit(), dart }
        edgeTimer = setInterval(edgeTick, 16)
      }, AIM_HOLD_MS),
    }
  }
  function pressMove(e: PointerEvent) {
    if (onBoardHover && e.pointerType === 'mouse') onBoardHover(toBoard(e))
    const p = viewPt(e)
    if (!p) return
    if (aim) {
      aim = { ...aim, at: clampAt(moveAim(aim.at, aim.finger, p)), finger: p }
      return
    }
    // Moving before the hold is up is a drag or a scroll, not a long press
    if (hold && Math.hypot(p.x - hold.start.x, p.y - hold.start.y) * pxPerUnit() > 8) cancelHold()
  }
  function pressEnd() {
    cancelHold()
    if (!aim) return
    const { dart } = aim
    const at = aimed
    const off = aimOff
    stopAim()
    drag = null
    // The click that follows is not another dart
    justDragged = true
    setTimeout(() => {
      justDragged = false
    })
    if (!at || off) return
    const hit = { segment: segmentAt(at.x, at.y), coords: at }
    if (dart !== null) onDartMove?.(dart, hit)
    else onBoardClick?.(hit)
  }
  function pressCancel() {
    cancelHold()
    stopAim()
  }

  // Markers on the same segment are spread so none hides another
  const otherMarkerPos = $derived(markerPositions(playerMarkers.filter(m => !m.isActive).map(m => m.segment)))

  const DOT_COLORS = ['var(--color-accent)', 'var(--color-accent)', 'var(--color-accent)']
  const DOT_STROKE = 'var(--color-bg)'
  // Zoomed content is clipped to the board's round background
  const uid = $props.id()
  const clipId = `board-clip-${uid}`
  // The picture is clipped to the board in board units, so its square edge never shows, zoomed or not
  const photoClipId = `photo-clip-${uid}`

  const precise = $derived(!!onBoardClick)
  // Light up the segment under the cursor
  const hoverable = $derived(precise)

  // Suggested checkout target: a pulsing wedge outline (SMIL, not CSS — a <style> tag here
  // breaks SSR under the current Vite/Tailwind setup). Static (no pulse) if reduced motion.
  const noMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
</script>

{#snippet checkoutGlowAnim()}
  <animate attributeName="stroke-opacity" values="0.12;0.75;0.12" dur="1.2s" repeatCount="indefinite" />
  <animate attributeName="stroke-width" values="0.012;0.034;0.012" dur="1.2s" repeatCount="indefinite" />
{/snippet}
{#snippet checkoutLineAnim()}
  <animate attributeName="stroke" values="#c6f24e;#dcff7a;#c6f24e" dur="1.2s" repeatCount="indefinite" />
{/snippet}

<!-- Pointer-only: tapping where the dart landed; the keypad is the keyboard way to enter darts -->
<svg
  bind:this={svgEl}
  role={precise || onDartMove ? 'application' : 'img'}
  aria-label="Dartboard"
  viewBox={zoomBox ? `${zoomBox.x} ${zoomBox.y} ${zoomBox.w} ${zoomBox.w}` : '-1.15 -1.15 2.3 2.3'}
  class="w-full select-none {hoverable ? 'cursor-crosshair' : ''}"
  xmlns="http://www.w3.org/2000/svg"
  onclick={precise ? boardClick : undefined}
  style={precise || onDartMove ? 'touch-action:none;-webkit-touch-callout:none' : undefined}
  onpointerdown={precise || onDartMove ? pressStart : undefined}
  onpointermove={pressMove}
  onpointerup={pressEnd}
  onpointercancel={pressCancel}
  onpointerleave={onBoardHover ? () => onBoardHover(null) : undefined}
  oncontextmenu={e => {
    if (precise) e.preventDefault()
  }}
>
  <!-- Round normally; zoomed in, the whole square shows the board -->
  <defs>
    <clipPath id={clipId}
      >{#if zoomBox}<rect x="-5" y="-5" width="10" height="10" />{:else}<circle cx="0" cy="0" r="1.12" />{/if}</clipPath
    >
    <clipPath id={photoClipId}><circle cx="0" cy="0" r="1.12" /></clipPath>
  </defs>
  {#if zoomBox}<rect x="-5" y="-5" width="10" height="10" fill="var(--color-bg-deep)" />{:else}<circle
      cx="0"
      cy="0"
      r="1.12"
      fill="var(--color-bg-deep)"
    />{/if}

  <g clip-path="url(#{clipId})">
    <g style="transform: {zoom === 1 ? 'none' : `scale(${zoom})`}; transition: transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)">
      <!-- Camera still: the image's edge is at r = 1.5 -->
      {#if stills.length}
        <g clip-path="url(#{photoClipId})">
          {#each stills as src (src)}
            <image
              href={src}
              x="-1.5"
              y="-1.5"
              width="3"
              height="3"
              preserveAspectRatio="none"
              aria-hidden="true"
              style="pointer-events:none"
              onerror={() => {
                if (src === cameraSrc) failedSrc = src
              }}
            />
          {/each}
        </g>
      {/if}

      <!-- Sector fills and wire dividers (on a camera still: wires only) -->
      {#each sectors as { num, i, paths, wa } (num)}
        {#each paths as { ring, d } (ring)}
          <path
            {d}
            fill={photo ? 'transparent' : ringColor(i, ring)}
            stroke="#8d8e84"
            stroke-width="1"
            stroke-opacity={wireOpacity}
            vector-effect="non-scaling-stroke"
            class={hoverable && !photo ? '[@media(hover:hover)]:hover:brightness-125' : ''}
          />
        {/each}
        <line
          x1={R.bull25 * Math.cos(wa)}
          y1={-R.bull25 * Math.sin(wa)}
          x2={R.db * Math.cos(wa)}
          y2={-R.db * Math.sin(wa)}
          stroke="#8d8e84"
          stroke-width="1.2"
          stroke-opacity={wireOpacity}
          vector-effect="non-scaling-stroke"
        />
      {/each}

      <!-- Ring wire circles -->
      {#each [R.bull25, R.si, R.tr, R.so, R.db] as r (r)}
        <circle
          cx="0"
          cy="0"
          {r}
          fill="none"
          stroke="#8d8e84"
          stroke-width="1.2"
          stroke-opacity={wireOpacity}
          vector-effect="non-scaling-stroke"
        />
      {/each}

      <!-- Bull fills -->
      <circle
        cx="0"
        cy="0"
        r={R.bull25}
        fill={photo ? 'transparent' : '#1e7a4f'}
        stroke="#8d8e84"
        stroke-width="1.2"
        stroke-opacity={wireOpacity}
        vector-effect="non-scaling-stroke"
        class={hoverable && !photo ? '[@media(hover:hover)]:hover:brightness-125' : ''}
      />
      <circle
        cx="0"
        cy="0"
        r={R.bull50}
        fill={photo ? 'transparent' : '#d23b36'}
        stroke="#8d8e84"
        stroke-width="1.2"
        stroke-opacity={wireOpacity}
        vector-effect="non-scaling-stroke"
        class={hoverable && !photo ? '[@media(hover:hover)]:hover:brightness-125' : ''}
      />

      {#if dim}
        <circle cx="0" cy="0" r="1.12" fill="var(--color-bg-deep)" fill-opacity="0.45" style="pointer-events:none" />
      {/if}

      <!-- ATC targets: thrower's in lime, next player's dashed white -->
      {#each [{ seg: target, next: false }, { seg: nextTarget, next: true }] as t (t.next)}
        {#if t.seg}
          {@const sector = sectors.find(s => s.num === t.seg)}
          {@const style = t.next
            ? { fill: 'none', 'fill-opacity': '0', stroke: 'var(--color-text)', 'stroke-width': '0.012', 'stroke-dasharray': '0.035 0.024' }
            : {
                fill: 'var(--color-accent)',
                'fill-opacity': '0.38',
                stroke: 'var(--color-accent)',
                'stroke-width': '0.018',
                'stroke-dasharray': 'none',
              }}
          {#if sector}
            <path d={sectorPath(R.bull25, R.db, sector.a1, sector.a2)} {...style} stroke-linejoin="round" style="pointer-events:none" />
          {:else if t.seg === 25 || t.seg === 50}
            <circle cx="0" cy="0" r={t.seg === 25 ? R.bull25 : R.bull50} {...style} style="pointer-events:none" />
          {/if}
        {/if}
      {/each}

      <!-- Number labels — pointer-events:none so clicks go through to paths -->
      {#each sectors as { num, tx, ty } (num)}
        <text
          x={tx}
          y={ty}
          text-anchor="middle"
          dy="0.35em"
          fill={num === target ? 'var(--color-accent)' : dim ? 'var(--color-text-dim)' : 'var(--color-text)'}
          font-size={num === target ? '0.123' : '0.09'}
          font-family="Barlow Condensed, sans-serif"
          font-weight={num === target ? '700' : '600'}
          style="pointer-events:none"
        >
          {num}
        </text>
      {/each}

      <!-- Other-player markers: white circle with initial -->
      {#each playerMarkers.filter(m => !m.isActive) as marker, k (k)}
        {@const pos = otherMarkerPos[k]}
        {#if pos}
          <circle
            cx={pos.x}
            cy={pos.y}
            r="0.085"
            fill="white"
            stroke="var(--color-bg-deep)"
            stroke-width="0.01"
            style="pointer-events:none"
          />
          <text
            x={pos.x}
            y={pos.y}
            text-anchor="middle"
            dy="0.35em"
            fill="var(--color-bg-deep)"
            font-size="0.072"
            font-family="Barlow Condensed, sans-serif"
            font-weight="bold"
            style="pointer-events:none"
          >
            {marker.initial}
          </text>
        {/if}
      {/each}

      <!-- Next suggested checkout target: the exact ring wedge, glowing (x01). Only the very
           next dart — later darts in the chain show in the dart slots below, not on the board.
           Drawn under the thrown darts so a dart marker always stays on top. -->
      {#if checkoutTargets[0]}
        {@const hl = checkoutHighlight(checkoutTargets[0])}
        {#if hl}
          {#if 'wedge' in hl}
            <path
              d={hl.wedge}
              fill="none"
              stroke="var(--color-accent)"
              stroke-opacity={noMotion ? '0.4' : '0.12'}
              stroke-width={noMotion ? '0.02' : '0.012'}
              stroke-linejoin="round"
              style="pointer-events:none"
            >
              {#if !noMotion}{@render checkoutGlowAnim()}{/if}
            </path>
            <path
              d={hl.wedge}
              fill="none"
              stroke="var(--color-accent)"
              stroke-width="0.02"
              stroke-linejoin="round"
              style="pointer-events:none"
            >
              {#if !noMotion}{@render checkoutLineAnim()}{/if}
            </path>
          {:else}
            <circle
              cx="0"
              cy="0"
              r={hl.bull}
              fill="none"
              stroke="var(--color-accent)"
              stroke-opacity={noMotion ? '0.4' : '0.12'}
              stroke-width={noMotion ? '0.02' : '0.012'}
              style="pointer-events:none"
            >
              {#if !noMotion}{@render checkoutGlowAnim()}{/if}
            </circle>
            <circle cx="0" cy="0" r={hl.bull} fill="none" stroke="var(--color-accent)" stroke-width="0.02" style="pointer-events:none">
              {#if !noMotion}{@render checkoutLineAnim()}{/if}
            </circle>
          {/if}
        {/if}
      {/if}

      <!-- Darts -->
      {#each darts as dart, i (i)}
        {@const pos = drag?.index === i ? drag.at : dartPos(dart)}
        {@const selected = selectedDart === i}
        {#if pos}
          <!-- The segment label only shows while the dart is hovered, selected or dragged -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g
            class="group {canDrag(i) ? (drag ? 'cursor-grabbing' : 'cursor-grab') : ''}"
            style="touch-action:none"
            onpointerdown={e => dragStart(e, i)}
            onpointermove={dragMove}
            onpointerup={dragEnd}
            onpointercancel={() => (drag = null)}
          >
            {#if selected}
              <circle
                cx={pos.x}
                cy={-pos.y}
                r="0.075"
                fill="var(--color-accent)"
                fill-opacity="0.18"
                stroke="var(--color-accent)"
                stroke-width="0.012"
                stroke-dasharray="0.02 0.015"
              />
            {/if}
            <circle
              cx={pos.x}
              cy={-pos.y}
              r={selected ? 0.05 : 0.04}
              fill={DOT_COLORS[i % DOT_COLORS.length]}
              stroke={DOT_STROKE}
              stroke-width="0.008"
            />
            <text
              x={pos.x + 0.06}
              y={-pos.y}
              dy="0.35em"
              fill="#ffffff"
              stroke="#000000"
              stroke-width="0.016"
              stroke-linejoin="round"
              paint-order="stroke"
              font-size="0.065"
              font-family="system-ui,sans-serif"
              font-weight="bold"
              class="{selected ? '' : 'opacity-0'} group-hover:opacity-100 transition-opacity"
              style="pointer-events:none"
            >
              {drag?.index === i ? segmentAt(drag.at.x, drag.at.y).name : dart.segment.name}
            </text>
          </g>
        {:else}
          <text
            x={-0.15 + i * 0.14}
            y="1.05"
            text-anchor="middle"
            dy="0.35em"
            fill="var(--color-accent)"
            font-size="0.1"
            font-family="Barlow Condensed, sans-serif"
            style="pointer-events:none">✕</text
          >
        {/if}
      {/each}

      <!-- Overlay marks are informational: clicks go through to the segments -->
      <g style="pointer-events:none">{@render overlay?.(zoom)}</g>
    </g>
  </g>

  <!-- Long-press aim: crosshair above the finger and the segment it's on, drawn unzoomed.
       Two-tone (dark outline + light inner stroke) so it reads on every board colour: the
       black/cream segments and the red/green rings. -->
  {#if zoomBox && shown && aimed}
    {@const at = shown}
    {@const tone = aimOff ? 'var(--color-live-text)' : 'var(--color-accent)'}
    {@const outline = 'rgba(8,9,7,0.8)'}
    <svg x={zoomBox.x} y={zoomBox.y} width={zoomBox.w} height={zoomBox.w} viewBox="-1.15 -1.15 2.3 2.3" style="pointer-events:none">
      <circle cx={at.x} cy={at.y} r="0.045" fill="none" stroke={outline} stroke-width="0.026" />
      <path
        d="M{at.x - 0.08} {at.y}h0.05M{at.x + 0.03} {at.y}h0.05M{at.x} {at.y - 0.08}v0.05M{at.x} {at.y + 0.03}v0.05"
        stroke={outline}
        stroke-width="0.026"
        stroke-linecap="round"
      />
      <circle cx={at.x} cy={at.y} r="0.012" fill={outline} />
      <circle cx={at.x} cy={at.y} r="0.045" fill="none" stroke={tone} stroke-width="0.012" />
      <path
        d="M{at.x - 0.08} {at.y}h0.05M{at.x + 0.03} {at.y}h0.05M{at.x} {at.y - 0.08}v0.05M{at.x} {at.y + 0.03}v0.05"
        stroke={tone}
        stroke-width="0.012"
        stroke-linecap="round"
      />
      <circle cx={at.x} cy={at.y} r="0.008" fill={tone} />
      <rect
        x="-0.26"
        y="-1.12"
        width="0.52"
        height="0.16"
        rx="0.08"
        fill="var(--color-bg)"
        fill-opacity="0.85"
        stroke={tone}
        stroke-width="0.008"
      />
      <text
        x="0"
        y="-1.04"
        text-anchor="middle"
        dy="0.35em"
        fill={tone}
        font-size="0.1"
        font-family="Barlow Condensed, sans-serif"
        font-weight="700">{aimOff ? 'Cancel' : segmentAt(aimed.x, aimed.y).name}</text
      >
    </svg>
  {/if}
</svg>
