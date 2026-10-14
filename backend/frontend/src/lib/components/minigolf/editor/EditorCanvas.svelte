<!--
  The hole editor's 2D canvas: HoleView's drawing of the hole plus the editor's handles (corner
  squares and ● edge midpoints for the outline), the selection ring, placement previews and the
  height map. Pointer positions are course mm (the SVG's own coordinates); snapping to the grid and
  45° is on unless Shift is held. A drag shows its result here and hands it up once, on release
  (one undo step); a click that places something hands it up at once.
-->
<script lang="ts">
  import HoleView from '../HoleView.svelte'
  import { heightAt } from '$shared/minigolf/3d/ground'
  import type { ElementRef } from '$shared/minigolf/checks'
  import { bounds } from '$shared/minigolf/geometry'
  import { BUMPER_R, GRID } from '$shared/minigolf/presets'
  import type { Hole, Pt } from '$shared/minigolf/types'
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
  import { heightOf, type Tool, type ToolOptions } from '$lib/minigolf/editor/tools'

  let {
    hole,
    tool,
    selection,
    options,
    heightMap = false,
    onselect,
    oncommit,
  }: {
    hole: Hole
    tool: Tool
    selection: ElementRef | null
    options: ToolOptions
    heightMap?: boolean
    onselect: (ref: ElementRef | null) => void
    /** One finished edit: one undo step. */
    oncommit: (h: Hole) => void
  } = $props()

  type Drag =
    // `grab`: where the pointer went down; `orig`: the point dragged (a delta of [0, 0] for a move);
    // `threshold`: how far (mm) the pointer must go before it's a drag rather than a click
    | { type: 'corner'; index: number; grab: Pt; orig: Pt; threshold: number }
    | { type: 'move'; ref: ElementRef; grab: Pt; orig: Pt; threshold: number }
    | { type: 'tee' | 'cup'; grab: Pt; orig: Pt; threshold: number }
    | { type: 'wall' | 'ridge' | 'plateau'; from: Pt }

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

  /** The hole as the drag in progress would leave it, or null when nothing's being dragged. */
  const dragged = $derived.by((): Hole | null => {
    const d = drag
    if (!d || !pointer) return null
    const { at, free } = pointer
    if ('from' in d) {
      const to = free ? at : snap(at, { grid: true, angle45From: d.type === 'plateau' ? undefined : d.from })
      if (Math.hypot(to[0] - d.from[0], to[1] - d.from[1]) < GRID / 2) return null
      if (d.type === 'wall') return addWall(hole, d.from, to, options.wallThickness)
      if (d.type === 'ridge') return addRidge(hole, d.from, to, options.brushSize, heightOf(options))
      return addPlateau(hole, d.from, to, heightOf(options), options.rampSide)
    }
    const n = hole.outline.length
    const prev = d.type === 'corner' ? hole.outline[(d.index - 1 + n) % n] : undefined
    const p = dragTo(d.orig, d.grab, at, { threshold: d.threshold, grid: !free, angle45From: free ? undefined : prev })
    if (!p) return null
    switch (d.type) {
      case 'corner':
        return moveCorner(hole, d.index, p)
      case 'move':
        return moveElement(hole, d.ref, p)
      case 'tee':
        return moveTee(hole, p)
      case 'cup':
        return moveCup(hole, p)
    }
  })
  const shown = $derived(dragged ?? hole)
  /** The line being drawn (a wall, a ridge or a plateau's diagonal), for its length readout. */
  const drawing = $derived.by(() => {
    if (!drag || !('from' in drag) || !pointer || !dragged) return null
    const last = drag.type === 'wall' ? dragged.walls.at(-1)?.points[1] : null
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
    const slack = 8 * mmPerPx()
    const threshold = 4 * mmPerPx()
    pointer = { at, free }
    let next: Drag | null = null

    if (tool === 'outline' || (tool === 'select' && corner != null)) {
      if (mid != null) {
        oncommit(addCorner(hole, Number(mid)))
        onselect({ kind: 'outline', index: Number(mid) + 1 })
      } else if (corner != null) {
        onselect({ kind: 'outline', index: Number(corner) })
        next = { type: 'corner', index: Number(corner), grab: at, orig: hole.outline[Number(corner)], threshold }
      } else onselect(null)
    } else if (tool === 'select') {
      const ref = hitTest(hole, at, slack)
      onselect(ref)
      if (ref) next = { type: 'move', ref, grab: at, orig: [0, 0], threshold }
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
    const result = dragged
    const wasLine = drag && 'from' in drag
    drag = null
    if (!result) return
    oncommit(result)
    if (wasLine && tool === 'wall') onselect({ kind: 'wall', index: result.walls.length - 1 })
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
      default:
        return null
    }
  })

  const box = $derived(bounds(hole.outline))
  /** Handle size, mm: a share of the hole so it reads the same on every hole. */
  const unit = $derived(Math.max(box.maxX - box.minX, box.maxY - box.minY) / 90)
  const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ')

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
          {:else}
            <polyline points={ring.points} />
          {/if}
        </g>
      {/if}

      <!-- Outline handles: ● on each edge's middle adds a corner, a square per corner -->
      {#if tool === 'outline' || selection?.kind === 'outline'}
        {#each shown.outline as c, i (i)}
          {@const d = shown.outline[(i + 1) % shown.outline.length]}
          {#if tool === 'outline' && !drag}
            <circle
              data-mid={i}
              cx={(c[0] + d[0]) / 2}
              cy={(c[1] + d[1]) / 2}
              r={unit * 0.7}
              fill="#efeee6"
              stroke="#0a0b09"
              stroke-width={unit * 0.2}
              class="cursor-copy"
            />
          {/if}
        {/each}
        {#each shown.outline as c, i (i)}
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
