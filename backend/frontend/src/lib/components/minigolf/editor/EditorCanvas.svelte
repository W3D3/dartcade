<!--
  The hole editor's 2D canvas: HoleView's drawing of the hole plus the editor's handles (corner
  squares, ● edge midpoints and curve controls for the outline, a circle's centre and rim), the
  shape's guides, the selection ring, placement previews and the height map. Pointer positions are
  course mm (the SVG's own coordinates); snapping to the grid and 45° is on unless Shift is held. A
  drag shows its result here and hands it up once, on release (one undo step); a click that places
  something hands it up at once. A shape edit that doesn't bake shows red and, on release, hands up
  its reason instead.
-->
<script lang="ts">
  import HoleView from '../HoleView.svelte'
  import { heightAt } from '$shared/minigolf/3d/ground'
  import type { ElementRef } from '$shared/minigolf/checks'
  import { bounds } from '$shared/minigolf/geometry'
  import { BUMPER_R, GRID } from '$shared/minigolf/presets'
  import type { Circle, Curve, Hole, Pt } from '$shared/minigolf/types'
  import { heightTint } from '$lib/minigolf/view3d'
  import {
    addBumper,
    addCorner,
    addRadial,
    addPlateau,
    addRidge,
    addWall,
    dragTo,
    hitTest,
    moveCorner,
    moveCup,
    moveElement,
    moveTee,
    removeElement,
    snap,
  } from '$lib/minigolf/editor/ops'
  import { addCircle, moveCircle, moveControl, moveShapeCorner, resizeCircle, type ShapeResult } from '$lib/minigolf/editor/shapeOps'
  import { heightOf, type Tool, type ToolOptions } from '$lib/minigolf/editor/tools'

  let {
    hole,
    tool,
    selection,
    options,
    heightMap = false,
    onselect,
    oncommit,
    onrefuse,
  }: {
    hole: Hole
    tool: Tool
    selection: ElementRef | null
    options: ToolOptions
    heightMap?: boolean
    onselect: (ref: ElementRef | null) => void
    /** One finished edit: one undo step. */
    oncommit: (h: Hole) => void
    /** A finished shape edit that was refused, and why. */
    onrefuse: (reason: string) => void
  } = $props()

  type Drag =
    // `grab`: where the pointer went down; `orig`: the point dragged (a delta of [0, 0] for a move);
    // `threshold`: how far (mm) the pointer must go before it's a drag rather than a click
    | { type: 'corner'; index: number; grab: Pt; orig: Pt; threshold: number }
    | { type: 'move'; ref: ElementRef; grab: Pt; orig: Pt; threshold: number }
    | { type: 'tee' | 'cup'; grab: Pt; orig: Pt; threshold: number }
    // A curve's control point; a circle by its centre (move) or its rim (resize)
    | { type: 'control'; index: number; which: 'c1' | 'c2'; grab: Pt; orig: Pt; threshold: number }
    | { type: 'circle' | 'rim'; index: number; grab: Pt; orig: Pt; threshold: number }
    | { type: 'new-circle'; center: Pt; threshold: number }
    | { type: 'wall' | 'ridge' | 'plateau'; from: Pt }

  /** What a drag would leave, or why it's refused, with the circle or point it's placing (drawn red while refused). */
  type Preview = { result: ShapeResult; circle?: Circle; point?: Pt }
  const done = (h: Hole): Preview => ({ result: { ok: true, hole: h } })
  /** A circle's radius, mm: 10 mm steps unless drawn freely, never under 50 mm. */
  const radius = (r: number, free: boolean) => Math.max(50, free ? r : Math.round(r / 10) * 10)

  let layer = $state<SVGGElement>()
  let drag = $state<Drag | null>(null)
  /** The pointer, mm, and whether Shift (draw freely) was held. */
  let pointer = $state<{ at: Pt; free: boolean } | null>(null)

  function toCourse(e: PointerEvent): Pt | null {
    const m = layer?.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [Math.round(p.x), Math.round(p.y)]
  }
  /** Course mm per screen pixel, so handles and click slack keep their size on screen. */
  function mmPerPx(): number {
    const m = layer?.getScreenCTM()
    return m && m.a > 0 ? 1 / m.a : 1
  }
  const gridded = (p: Pt, free: boolean) => (free ? p : snap(p, { grid: true }))

  /** The outline's corners as the Outline tool edits them: the shape's, or the plain outline's. */
  const cornersOf = (h: Hole) => h.shape?.corners ?? h.outline
  const circlesOf = (h: Hole) => h.shape?.circles ?? []

  /** The drag in progress (see Preview), or null when nothing's being dragged. */
  const dragged = $derived.by((): Preview | null => {
    const d = drag
    if (!d || !pointer) return null
    const { at, free } = pointer
    if ('from' in d) {
      const to = free ? at : snap(at, { grid: true, angle45From: d.type === 'plateau' ? undefined : d.from })
      if (Math.hypot(to[0] - d.from[0], to[1] - d.from[1]) < GRID / 2) return null
      if (d.type === 'wall') return done(addWall(hole, d.from, to, options.wallThickness))
      if (d.type === 'ridge') return done(addRidge(hole, d.from, to, options.brushSize, heightOf(options)))
      return done(addPlateau(hole, d.from, to, heightOf(options), options.rampSide))
    }
    if (d.type === 'new-circle') {
      const r = Math.hypot(at[0] - d.center[0], at[1] - d.center[1])
      if (r <= d.threshold) return null
      const circle = { center: d.center, r: radius(r, free) }
      return { result: addCircle(hole, circle.center, circle.r), circle }
    }
    const corners = cornersOf(hole)
    const prev = d.type === 'corner' ? corners[(d.index - 1 + corners.length) % corners.length] : undefined
    // The rim follows the pointer exactly: its radius snaps instead
    const grid = !free && d.type !== 'rim'
    const p = dragTo(d.orig, d.grab, at, { threshold: d.threshold, grid, angle45From: free ? undefined : prev })
    if (!p) return null
    switch (d.type) {
      case 'corner':
        return hole.shape ? { result: moveShapeCorner(hole, d.index, p), point: p } : done(moveCorner(hole, d.index, p))
      case 'control':
        return { result: moveControl(hole, d.index, d.which, p), point: p }
      case 'circle':
        return { result: moveCircle(hole, d.index, p), circle: { ...circlesOf(hole)[d.index], center: p } }
      case 'rim': {
        const { center } = circlesOf(hole)[d.index]
        const r = radius(Math.hypot(p[0] - center[0], p[1] - center[1]), free)
        return { result: resizeCircle(hole, d.index, r), circle: { center, r } }
      }
      case 'move':
        return done(moveElement(hole, d.ref, p))
      case 'tee':
        return done(moveTee(hole, p))
      case 'cup':
        return done(moveCup(hole, p))
    }
  })
  // A refused drag leaves the last valid shape on show, with what it tried in red
  const shown = $derived(dragged?.result.ok ? dragged.result.hole : hole)
  const refused = $derived(dragged && !dragged.result.ok ? dragged : null)
  /** The line being drawn (a wall, a ridge or a plateau's diagonal), for its length readout. */
  const drawing = $derived.by(() => {
    if (!drag || !('from' in drag) || !pointer || !dragged) return null
    const last = drag.type === 'wall' ? shown.walls.at(-1)?.points[1] : null
    const to = last ?? pointer.at
    const len = Math.hypot(to[0] - drag.from[0], to[1] - drag.from[1])
    const deg = Math.round((Math.atan2(-(to[1] - drag.from[1]), to[0] - drag.from[0]) * 180) / Math.PI)
    return { to, label: `${Math.round(len)} mm · ${deg}°` }
  })

  function onpointerdown(e: PointerEvent): void {
    if (e.button !== 0) return
    const at = toCourse(e)
    if (!at) return
    const free = e.shiftKey
    const sp = gridded(at, free)
    const target = e.target instanceof Element ? e.target : null
    const corner = target?.closest('[data-corner]')?.getAttribute('data-corner')
    const mid = target?.closest('[data-mid]')?.getAttribute('data-mid')
    const edge = target?.closest('[data-edge]')?.getAttribute('data-edge')
    const control = target?.closest('[data-control]')
    const circleHandle = target?.closest('[data-circle]')
    const slack = 8 * mmPerPx()
    const threshold = 4 * mmPerPx()
    pointer = { at, free }
    let next: Drag | null = null

    if (circleHandle) {
      // A selected circle's own handles win over what's under them (the cup often sits at its centre)
      const index = Number(circleHandle.getAttribute('data-circle'))
      const { center } = circlesOf(hole)[index]
      next =
        circleHandle.getAttribute('data-part') === 'rim'
          ? { type: 'rim', index, grab: at, orig: at, threshold }
          : { type: 'circle', index, grab: at, orig: center, threshold }
    } else if (tool === 'outline' || (tool === 'select' && corner != null)) {
      if (mid != null) {
        oncommit(addCorner(hole, Number(mid)))
        onselect({ kind: 'outline', index: Number(mid) + 1 })
      } else if (corner != null) {
        onselect({ kind: 'outline', index: Number(corner) })
        next = { type: 'corner', index: Number(corner), grab: at, orig: cornersOf(hole)[Number(corner)], threshold }
      } else if (control) {
        const index = Number(control.getAttribute('data-control'))
        const which = control.getAttribute('data-which') === 'c2' ? 'c2' : 'c1'
        const curve = hole.shape?.curves[index]
        onselect({ kind: 'edge', index })
        if (curve) next = { type: 'control', index, which, grab: at, orig: curve[which], threshold }
      } else if (edge != null) {
        onselect({ kind: 'edge', index: Number(edge) })
      } else onselect(null)
    } else if (tool === 'select') {
      const ref = hitTest(hole, at, slack)
      onselect(ref)
      if (ref?.kind === 'circle') {
        // Grabbed near the centre it moves, on the rim it resizes
        const { center, r } = circlesOf(hole)[ref.index]
        const nearCentre = Math.hypot(at[0] - center[0], at[1] - center[1]) < r / 2
        next = nearCentre
          ? { type: 'circle', index: ref.index, grab: at, orig: center, threshold }
          : { type: 'rim', index: ref.index, grab: at, orig: at, threshold }
      } else if (ref) next = { type: 'move', ref, grab: at, orig: [0, 0], threshold }
    } else if (tool === 'circle') {
      next = { type: 'new-circle', center: sp, threshold }
    } else if (tool === 'tee' || tool === 'cup') {
      // Grabbed on the tee (or cup) only: a click elsewhere leaves it where it is
      if (hitTest(hole, at, slack)?.kind === tool) next = { type: tool, grab: at, orig: tool === 'tee' ? hole.tee : hole.cup.at, threshold }
    } else if (tool === 'bumper') {
      oncommit(addBumper(hole, sp, options.bumperSize, options.bounce))
      onselect({ kind: 'bumper', index: hole.bumpers.length })
    } else if (tool === 'wall') {
      next = { type: 'wall', from: sp }
    } else if (options.brush === 'hill' || options.brush === 'dip') {
      oncommit(addRadial(hole, sp, options.brushSize, options.brush === 'dip' ? -heightOf(options) : heightOf(options)))
    } else if (options.brush === 'flatten') {
      const ref = hitTest(hole, at, slack, true)
      if (ref) oncommit(removeElement(hole, ref))
      onselect(null)
    } else {
      next = { type: options.brush, from: sp }
    }

    if (next && e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId)
    drag = next
  }

  function onpointermove(e: PointerEvent): void {
    const at = toCourse(e)
    pointer = at ? { at, free: e.shiftKey } : null
  }

  function onpointerup(): void {
    const result = dragged?.result
    const type = drag?.type
    drag = null
    if (!result) return
    if (!result.ok) return onrefuse(result.reason)
    oncommit(result.hole)
    if (type === 'wall') onselect({ kind: 'wall', index: result.hole.walls.length - 1 })
    if (type === 'new-circle') onselect({ kind: 'circle', index: circlesOf(result.hole).length - 1 })
  }

  function cancel(): void {
    drag = null
  }
  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') cancel()
  }

  /** The selection ring's shape, around the selected element as it's drawn now. */
  type Ring =
    | { type: 'circle'; at: Pt; r: number }
    | { type: 'box'; x: number; y: number; w: number; h: number }
    | { type: 'line'; points: string }
    | { type: 'path'; d: string }
  const ring = $derived.by((): Ring | null => {
    if (!selection) return null
    const i = selection.index
    const box = (a: Pt, b: Pt): Ring => ({
      type: 'box',
      x: Math.min(a[0], b[0]),
      y: Math.min(a[1], b[1]),
      w: Math.abs(b[0] - a[0]),
      h: Math.abs(b[1] - a[1]),
    })
    switch (selection.kind) {
      case 'tee':
        return box([shown.tee[0] - 70 - unit, shown.tee[1] - 70 - unit], [shown.tee[0] + 70 + unit, shown.tee[1] + 70 + unit])
      case 'cup':
        return { type: 'circle', at: shown.cup.at, r: shown.cup.r + unit }
      case 'bumper':
        return { type: 'circle', at: shown.bumpers[i].at, r: shown.bumpers[i].r + unit }
      case 'wall':
        return { type: 'line', points: pts(shown.walls[i].points) }
      case 'slope': {
        const s = shown.slopes[i]
        return 'radial' in s
          ? { type: 'circle', at: s.radial.center, r: s.radial.radius }
          : { type: 'line', points: pts([s.bump.from, s.bump.to]) }
      }
      case 'terrain': {
        const { mesa } = (shown.terrain ?? [])[i]
        return box(mesa.from, mesa.to)
      }
      case 'circle': {
        const c = circlesOf(shown)[i]
        return { type: 'circle', at: c.center, r: c.r + unit }
      }
      case 'edge':
        return i < cornersOf(shown).length ? { type: 'path', d: edgePath(shown, i) } : null
      default:
        return null
    }
  })

  const box = $derived(bounds(hole.outline))
  /** Handle size, mm: a share of the hole so it reads the same on every hole. */
  const unit = $derived(Math.max(box.maxX - box.minX, box.maxY - box.minY) / 90)
  const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ')

  const xy = ([x, y]: Pt) => `${x},${y}`
  /** Edge i as SVG path segments after its first corner: a line, or the cubic of its curve. */
  function edgeTo(curve: Curve | null | undefined, b: Pt): string {
    return curve ? `C ${xy(curve.c1)} ${xy(curve.c2)} ${xy(b)}` : `L ${xy(b)}`
  }
  function edgePath(h: Hole, i: number): string {
    const corners = cornersOf(h)
    return `M ${xy(corners[i])} ${edgeTo(h.shape?.curves[i], corners[(i + 1) % corners.length])}`
  }
  /** The corners' polygon with its curves, closed. */
  const shapePath = (h: Hole) => {
    const corners = cornersOf(h)
    return `M ${xy(corners[0])} ${corners.map((_, i) => edgeTo(h.shape?.curves[i], corners[(i + 1) % corners.length])).join(' ')} Z`
  }
  /** The middle of edge i: on its curve (t = 0.5) where a new corner splits it. */
  function edgeMid(h: Hole, i: number): Pt {
    const corners = cornersOf(h)
    const [a, b] = [corners[i], corners[(i + 1) % corners.length]]
    const c = h.shape?.curves[i]
    if (!c) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    return [(a[0] + 3 * c.c1[0] + 3 * c.c2[0] + b[0]) / 8, (a[1] + 3 * c.c1[1] + 3 * c.c2[1] + b[1]) / 8]
  }

  /** The height map: cells over the hole, each the felt's colour lit as the 3D view does. */
  const cells = $derived.by(() => {
    if (!heightMap) return []
    const size = Math.max(GRID / 2, Math.max(box.maxX - box.minX, box.maxY - box.minY) / 80)
    const out: { x: number; y: number; size: number; fill: string }[] = []
    for (let y = box.minY; y < box.maxY; y += size) {
      for (let x = box.minX; x < box.maxX; x += size) {
        const t = heightTint(heightAt(hole, [x + size / 2, y + size / 2]))
        if (t === 1) continue
        const [r, g, b] = [0x2e, 0x7d, 0x4c].map(c => Math.min(255, Math.round(c * t)))
        out.push({ x, y, size, fill: `rgb(${r} ${g} ${b})` })
      }
    }
    return out
  })
  const uid = $props.id()

  const placing = $derived(tool !== 'select' && tool !== 'outline')
  const SELECTION = '#c6f24e'
</script>

<svelte:window {onkeydown} />

<div
  class="h-full w-full {placing ? 'cursor-crosshair' : ''}"
  role="application"
  aria-label="Hole canvas"
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={cancel}
  onpointerleave={() => !drag && (pointer = null)}
>
  <HoleView hole={shown} ball={shown.tee} ballColor="#efeee6" halo={false} frame={drag ? hole.outline : undefined}>
    {#snippet underlay()}
      {#if cells.length}
        <clipPath id="{uid}-felt"><polygon points={pts(shown.outline)} /></clipPath>
        <g clip-path="url(#{uid}-felt)" pointer-events="none" data-testid="height-map">
          {#each cells as c, i (i)}<rect x={c.x} y={c.y} width={c.size + 1} height={c.size + 1} fill={c.fill} />{/each}
        </g>
      {/if}
    {/snippet}
    <g bind:this={layer}>
      <!-- Selection ring -->
      {#if ring}
        <g fill="none" stroke={SELECTION} stroke-width={unit * 0.35} stroke-dasharray="{unit} {unit * 0.6}" pointer-events="none">
          {#if ring.type === 'circle'}
            <circle cx={ring.at[0]} cy={ring.at[1]} r={ring.r} />
          {:else if ring.type === 'box'}
            <rect x={ring.x} y={ring.y} width={ring.w} height={ring.h} />
          {:else if ring.type === 'path'}
            <path d={ring.d} />
          {:else}
            <polyline points={ring.points} />
          {/if}
        </g>
      {/if}

      <!-- The shape's guides: the corners' polygon and the circles merged into the outline -->
      {#if (tool === 'outline' || tool === 'circle') && shown.shape}
        <g fill="none" stroke="#efeee6" stroke-opacity="0.6" stroke-width={unit * 0.15} pointer-events="none" data-testid="shape-guides">
          <path d={shapePath(shown)} stroke-dasharray="{unit * 0.8} {unit * 0.5}" />
          {#each shown.shape.circles as c, i (i)}<circle cx={c.center[0]} cy={c.center[1]} r={c.r} />{/each}
        </g>
      {/if}

      <!-- A selected circle's handles: drag the centre to move it, the rim to resize it -->
      {#if selection?.kind === 'circle' && circlesOf(shown)[selection.index]}
        {@const c = circlesOf(shown)[selection.index]}
        <g fill="#efeee6" stroke="#0a0b09" stroke-width={unit * 0.2} class="cursor-move">
          <circle data-circle={selection.index} data-part="centre" cx={c.center[0]} cy={c.center[1]} r={unit * 0.9} />
          <rect
            data-circle={selection.index}
            data-part="rim"
            x={c.center[0] + c.r - unit * 0.8}
            y={c.center[1] - unit * 0.8}
            width={unit * 1.6}
            height={unit * 1.6}
            class="cursor-ew-resize"
          />
        </g>
      {/if}

      <!-- Outline handles: an edge to select it, ● on each edge's middle adds a corner, the curve
           controls on their lines, a square per corner -->
      {#if tool === 'outline' || selection?.kind === 'outline' || selection?.kind === 'edge'}
        {@const corners = cornersOf(shown)}
        {#if tool === 'outline' && !drag}
          {#each corners as _, i (i)}
            <path
              data-edge={i}
              d={edgePath(shown, i)}
              fill="none"
              stroke="transparent"
              stroke-width={unit * 1.6}
              pointer-events="stroke"
              class="cursor-pointer"
            />
          {/each}
        {/if}
        {#if tool === 'outline'}
          {#each shown.shape?.curves ?? [] as curve, i (i)}
            {#if curve}
              {@const a = corners[i]}
              {@const b = corners[(i + 1) % corners.length]}
              <g stroke="#efeee6" stroke-width={unit * 0.15} pointer-events="none">
                <line x1={a[0]} y1={a[1]} x2={curve.c1[0]} y2={curve.c1[1]} />
                <line x1={b[0]} y1={b[1]} x2={curve.c2[0]} y2={curve.c2[1]} />
              </g>
              {#each ['c1', 'c2'] as const as which (which)}
                <circle
                  data-control={i}
                  data-which={which}
                  cx={curve[which][0]}
                  cy={curve[which][1]}
                  r={unit * 0.8}
                  fill="#0a0b09"
                  stroke="#efeee6"
                  stroke-width={unit * 0.25}
                  class="cursor-move"
                />
              {/each}
            {/if}
          {/each}
        {/if}
        {#each corners as _, i (i)}
          {#if tool === 'outline' && !drag}
            {@const m = edgeMid(shown, i)}
            <circle
              data-mid={i}
              cx={m[0]}
              cy={m[1]}
              r={unit * 0.7}
              fill="#efeee6"
              stroke="#0a0b09"
              stroke-width={unit * 0.2}
              class="cursor-copy"
            />
          {/if}
        {/each}
        {#each corners as c, i (i)}
          {@const on = selection?.kind === 'outline' && selection.index === i}
          <rect
            data-corner={i}
            x={c[0] - unit}
            y={c[1] - unit}
            width={unit * 2}
            height={unit * 2}
            fill={on ? SELECTION : '#efeee6'}
            stroke="#0a0b09"
            stroke-width={unit * 0.25}
            class="cursor-move"
          />
        {/each}
      {/if}

      <!-- A refused drag: the circle or point it tried, in red -->
      {#if refused}
        <g
          fill="#d23b36"
          fill-opacity="0.25"
          stroke="#d23b36"
          stroke-width={unit * 0.35}
          pointer-events="none"
          data-testid="refused-preview"
        >
          {#if refused.circle}
            <circle cx={refused.circle.center[0]} cy={refused.circle.center[1]} r={refused.circle.r} />
          {:else if refused.point}
            <circle cx={refused.point[0]} cy={refused.point[1]} r={unit} />
          {/if}
        </g>
      {/if}

      <!-- What a click would place -->
      {#if pointer && !drag}
        {@const at = gridded(pointer.at, pointer.free)}
        {#if tool === 'bumper'}
          <circle
            cx={at[0]}
            cy={at[1]}
            r={BUMPER_R[options.bumperSize]}
            fill="none"
            stroke="#d23b36"
            stroke-width={unit * 0.35}
            stroke-dasharray="{unit} {unit * 0.6}"
            pointer-events="none"
            data-testid="place-preview"
          />
        {:else if tool === 'terrain' && (options.brush === 'hill' || options.brush === 'dip')}
          <circle
            cx={at[0]}
            cy={at[1]}
            r={options.brushSize}
            fill="none"
            stroke="#efeee6"
            stroke-opacity="0.7"
            stroke-width={unit * 0.3}
            stroke-dasharray="{unit} {unit * 0.6}"
            pointer-events="none"
            data-testid="place-preview"
          />
        {/if}
      {/if}

      {#if drawing}
        <text
          x={drawing.to[0] + unit * 1.5}
          y={drawing.to[1] - unit * 1.5}
          fill="#efeee6"
          font-size={unit * 2.4}
          font-weight="700"
          stroke="#0a0b09"
          stroke-width={unit * 0.4}
          paint-order="stroke"
          pointer-events="none">{drawing.label}</text
        >
      {/if}
    </g>
  </HoleView>
</div>
