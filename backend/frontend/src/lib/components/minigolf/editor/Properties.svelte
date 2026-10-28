<script lang="ts">
  // The hole editor's Properties panel: the selection's fields (with Duplicate and Delete) under
  // the Select tool, otherwise the active tool's options for what it places next.
  import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js'
  import type { Snippet } from 'svelte'
  import { Copy, Spline, Trash } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Slider } from '$lib/components/ui/slider/index.js'
  import { G } from '$shared/minigolf/3d/ground'
  import type { ElementRef } from '$shared/minigolf/checks'
  import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'
  import { BOUNCE, BUMPER_R, CUP, WALL } from '$shared/minigolf/presets'
  import type { Hole, Pt } from '$shared/minigolf/types'
  import {
    moveCorner,
    moveCup,
    moveElement,
    moveTee,
    plateauEdges,
    setCupSize,
    setRadialHeight,
    updateBumper,
    updateSlope,
    updateTerrain,
    updateWall,
  } from '$lib/minigolf/editor/ops'
  import { moveCircle, moveShapeCorner, resizeCircle, type ShapeResult } from '$lib/minigolf/editor/shapeOps'
  import { MAX_HEIGHT, TOOLS, type ToolOptions, type Tool } from '$lib/minigolf/editor/tools'

  let {
    hole,
    tool,
    selection,
    options = $bindable(),
    onedit,
    onshape,
    oncurve,
    onduplicate,
    ondelete,
  }: {
    hole: Hole
    tool: Tool
    selection: ElementRef | null
    options: ToolOptions
    /** One edit: one undo step. */
    onedit: (h: Hole) => void
    /** An edit to the hole's shape: one undo step, or the reason it was refused. */
    onshape: (r: ShapeResult) => void
    /** Curves the selected edge, or straightens it. */
    oncurve: () => void
    onduplicate: () => void
    ondelete: () => void
  } = $props()

  const SIZES = [
    { value: 'S', label: 'S' },
    { value: 'M', label: 'M' },
    { value: 'L', label: 'L' },
  ] as const
  const BOUNCES = [
    { value: 'soft', label: 'Soft' },
    { value: 'normal', label: 'Normal' },
    { value: 'strong', label: 'Strong' },
  ] as const
  const THICKNESSES = [
    { value: 'thin', label: 'Thin' },
    { value: 'normal', label: 'Normal' },
  ] as const
  const CUP_SIZES = [
    { value: 'standard', label: 'Standard' },
    { value: 'beginner', label: 'Beginner' },
  ] as const
  const BRUSHES = [
    { value: 'hill', label: 'Hill' },
    { value: 'dip', label: 'Dip' },
    { value: 'ridge', label: 'Ridge' },
    { value: 'plateau', label: 'Plateau' },
    { value: 'flatten', label: 'Flatten' },
  ] as const
  const SIDES = [
    { value: 'N', label: 'N' },
    { value: 'E', label: 'E' },
    { value: 'S', label: 'S' },
    { value: 'W', label: 'W' },
  ] as const

  /** The item whose preset is `value`, if it's one of them. */
  const presetOf = <K extends string>(items: readonly { value: K }[], presets: Record<K, number>, value: number): K | null =>
    items.find(it => presets[it.value] === value)?.value ?? null

  const corners = $derived(hole.shape?.corners ?? hole.outline)
  const showSelection = $derived(
    !!selection &&
      (tool === 'select' ||
        (tool === 'outline' && (selection.kind === 'outline' || selection.kind === 'edge')) ||
        (tool === 'circle' && selection.kind === 'circle')),
  )
  const canDuplicate = $derived(!!selection && ['bumper', 'wall', 'slope', 'terrain'].includes(selection.kind))
  const canDelete = $derived(canDuplicate || selection?.kind === 'circle' || (selection?.kind === 'outline' && corners.length > 3))
  const circle = $derived(selection?.kind === 'circle' ? hole.shape?.circles[selection.index] : undefined)

  // The page drops a selection its element is gone from (undo), so indices here are valid
  const slope = $derived(selection?.kind === 'slope' ? hole.slopes[selection.index] : null)
  const radial = $derived(slope && 'radial' in slope ? slope.radial : null)
  const bump = $derived(slope && 'bump' in slope ? slope.bump : null)

  /** The selection's anchor (its X/Y fields), or null for a shape without one. */
  const anchor = $derived.by((): Pt | null => {
    if (!selection) return null
    const i = selection.index
    switch (selection.kind) {
      case 'outline':
        return corners[i]
      case 'tee':
        return hole.tee
      case 'cup':
        return hole.cup.at
      case 'bumper':
        return hole.bumpers[i].at
      case 'circle':
        return circle?.center ?? null
      default:
        return radial?.center ?? null
    }
  })
  function moveTo(axis: 0 | 1, v: number): void {
    if (!selection || !anchor || !Number.isFinite(v)) return
    const p: Pt = axis === 0 ? [v, anchor[1]] : [anchor[0], v]
    if (selection.kind === 'outline' && hole.shape) onshape(moveShapeCorner(hole, selection.index, p))
    else if (selection.kind === 'outline') onedit(moveCorner(hole, selection.index, p))
    else if (selection.kind === 'circle') onshape(moveCircle(hole, selection.index, p))
    else if (selection.kind === 'tee') onedit(moveTee(hole, p))
    else if (selection.kind === 'cup') onedit(moveCup(hole, p))
    else onedit(moveElement(hole, selection, [p[0] - anchor[0], p[1] - anchor[1]]))
  }

  const TITLES: Record<ElementRef['kind'], string> = {
    outline: 'Corner',
    edge: 'Edge',
    tee: 'Tee',
    cup: 'Cup',
    bumper: 'Bumper',
    wall: 'Wall',
    slope: 'Terrain',
    terrain: 'Plateau',
    circle: 'Circle',
  }
  const title = $derived.by(() => {
    if (!selection) return ''
    if (selection.kind === 'slope') return bump ? 'Ridge' : radial && radial.strength < 0 ? 'Dip' : 'Hill'
    const numbered = ['outline', 'edge', 'bumper', 'wall', 'circle'].includes(selection.kind)
    return numbered ? `${TITLES[selection.kind]} ${selection.index + 1}` : TITLES[selection.kind]
  })

  const num = (e: Event & { currentTarget: HTMLInputElement }) => e.currentTarget.valueAsNumber
  const positive = (v: number) => Number.isFinite(v) && v > 0
</script>

{#snippet segmented<V extends string>(
  label: string,
  items: readonly { value: V; label: string }[],
  current: V | null,
  onpick: (v: V) => void,
)}
  <div class="flex flex-col gap-1">
    <span class="text-[11px] label-caps text-text-dim">{label}</span>
    <RadioGroup
      value={current ?? ''}
      onValueChange={(v: string) => {
        const it = items.find(i => i.value === v)
        if (it) onpick(it.value)
      }}
      orientation="horizontal"
      aria-label={label}
      class="flex gap-1 rounded-[10px] bg-surface-inset p-1"
    >
      {#each items as it (it.value)}
        <RadioGroupItem value={it.value} variant="segment">{it.label}</RadioGroupItem>
      {/each}
    </RadioGroup>
  </div>
{/snippet}

{#snippet field(label: string, value: number, onset: (v: number) => void)}
  <label class="flex flex-col gap-1">
    <span class="text-[11px] label-caps text-text-dim">{label}</span>
    <input
      type="number"
      value={Math.round(value)}
      onchange={e => {
        onset(num(e))
        // A refused edit leaves the hole as it was: show its value, not what was typed
        e.currentTarget.value = String(Math.round(value))
      }}
      class="h-9 w-full rounded-[8px] border border-line-2 bg-bg px-2 text-[14px] text-text outline-none focus-visible:[outline:2px_solid_var(--color-accent)]"
    />
  </label>
{/snippet}

{#snippet panel(heading: string, body: Snippet)}
  <section aria-label="Properties" class="flex flex-col gap-3">
    <h2 class="m-0 font-display font-bold text-[20px] uppercase">{heading}</h2>
    {@render body()}
  </section>
{/snippet}

{#snippet selectionBody()}
  {#if selection}
    {@const i = selection.index}
    {#if anchor}
      <div class="grid grid-cols-2 gap-2">
        {@render field('X', anchor[0], v => moveTo(0, v))}
        {@render field('Y', anchor[1], v => moveTo(1, v))}
      </div>
    {/if}
    {#if selection.kind === 'circle' && circle}
      {@render field('Radius (mm)', circle.r, v => {
        if (positive(v)) onshape(resizeCircle(hole, i, v))
      })}
    {:else if selection.kind === 'edge'}
      <p class="m-0 text-[14px] text-text-muted">From corner {i + 1} to corner {((i + 1) % corners.length) + 1}.</p>
      <Button variant="outline" title="Curve or straighten (K)" onclick={oncurve}
        ><Spline size={16} />{hole.shape?.curves[i] ? 'Straighten' : 'Curve'}</Button
      >
    {:else if selection.kind === 'cup'}
      {@render segmented('Cup size', CUP_SIZES, presetOf(CUP_SIZES, CUP, hole.cup.r), v => onedit(setCupSize(hole, v)))}
    {:else if selection.kind === 'bumper' && hole.bumpers[i]}
      {@const b = hole.bumpers[i]}
      {@render segmented('Size', SIZES, presetOf(SIZES, BUMPER_R, b.r), v => onedit(updateBumper(hole, i, { r: BUMPER_R[v] })))}
      {@render segmented('Bounce', BOUNCES, presetOf(BOUNCES, BOUNCE, b.restitution ?? DEFAULT_PHYSICS.bumperRestitution), v =>
        onedit(updateBumper(hole, i, { restitution: BOUNCE[v] })),
      )}
    {:else if selection.kind === 'wall' && hole.walls[i]}
      {@render segmented(
        'Thickness',
        THICKNESSES,
        presetOf(THICKNESSES, WALL, hole.walls[i].thickness ?? DEFAULT_PHYSICS.wallThickness),
        v => onedit(updateWall(hole, i, { thickness: WALL[v] })),
      )}
    {:else if radial || bump}
      {#if radial}
        {@const r = radial}
        {@const height = (r.strength * r.radius) / G}
        <div class="grid grid-cols-2 gap-2">
          {@render field('Radius (mm)', r.radius, v => {
            if (positive(v)) onedit(updateSlope(hole, i, { radial: { ...r, radius: v, strength: (height * G) / v } }))
          })}
          {@render field(height < 0 ? 'Depth (mm)' : 'Height (mm)', Math.abs(height), v => onedit(setRadialHeight(hole, i, v)))}
        </div>
      {:else if bump}
        {@const height = (bump.strength * bump.width) / G}
        <div class="grid grid-cols-2 gap-2">
          {@render field('Width (mm)', bump.width, v => {
            if (positive(v)) onedit(updateSlope(hole, i, { bump: { ...bump, width: v, strength: (height * G) / v } }))
          })}
          {@render field('Height (mm)', height, v => {
            if (Number.isFinite(v)) onedit(updateSlope(hole, i, { bump: { ...bump, strength: (v * G) / bump.width } }))
          })}
        </div>
      {/if}
    {:else if selection.kind === 'terrain' && hole.terrain?.[i]}
      {@const mesa = hole.terrain[i].mesa}
      {@render field('Height (mm)', mesa.height, v => {
        if (Number.isFinite(v)) onedit(updateTerrain(hole, i, { mesa: { ...mesa, height: v } }))
      })}
      {@const side = SIDES.find(sd => plateauEdges(sd.value).every((e, k) => e === mesa.edges[k]))?.value ?? null}
      {@render segmented('Ramps down to the', SIDES, side, v =>
        onedit(updateTerrain(hole, i, { mesa: { ...mesa, edges: plateauEdges(v) } })),
      )}
    {/if}
    {#if canDuplicate || canDelete}
      <div class="flex gap-2">
        {#if canDuplicate}<Button variant="outline" onclick={onduplicate}><Copy size={16} />Duplicate</Button>{/if}
        {#if canDelete}<Button variant="destructive" onclick={ondelete}
            ><Trash size={16} />{selection.kind === 'outline' ? 'Remove corner' : 'Delete'}</Button
          >{/if}
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet toolBody()}
  {#if tool === 'select'}
    <p class="m-0 text-[14px] text-text-muted">Click anything on the hole, or in the list below, to change it.</p>
  {:else if tool === 'outline'}
    <p class="m-0 text-[14px] text-text-muted">
      {corners.length} corners. Drag a corner to move it, click ● on an edge to add one, click a corner to select it. Click an edge to curve it
      (K), then drag its handles. Snaps to a 50 mm grid and 45°; hold Shift to draw freely.
    </p>
  {:else if tool === 'circle'}
    <p class="m-0 text-[14px] text-text-muted">
      A round area merged into the outline, like a green round the cup. Drag from its centre to set the radius; it must overlap the course.
      Snaps to a 50 mm grid and 10 mm; hold Shift to draw freely.
    </p>
  {:else if tool === 'tee'}
    <p class="m-0 text-[14px] text-text-muted">
      One tee per hole. Drag it anywhere inside the outline. Balls start in the middle of the tee box.
    </p>
  {:else if tool === 'cup'}
    <p class="m-0 text-[14px] text-text-muted">One cup per hole. Keep it at least one ball away from the rail and walls.</p>
    {@render segmented('Cup size', CUP_SIZES, presetOf(CUP_SIZES, CUP, hole.cup.r), v => onedit(setCupSize(hole, v)))}
  {:else if tool === 'bumper'}
    <p class="m-0 text-[14px] text-text-muted">Round, red, fixed in place. Click on the felt to place one.</p>
    {@render segmented('Size', SIZES, options.bumperSize, v => (options.bumperSize = v))}
    {@render segmented('Bounce', BOUNCES, options.bounce, v => (options.bounce = v))}
  {:else if tool === 'wall'}
    <p class="m-0 text-[14px] text-text-muted">Straight, fixed rail pieces. Drag to draw; walls bounce like the outer rail.</p>
    {@render segmented('Thickness', THICKNESSES, options.wallThickness, v => (options.wallThickness = v))}
  {:else if tool === 'terrain'}
    <p class="m-0 text-[14px] text-text-muted">Shape the ground under the felt.</p>
    {@render segmented('Brush', BRUSHES, options.brush, v => (options.brush = v))}
    {#if options.brush !== 'flatten'}
      <div class="flex flex-col gap-1">
        <span class="text-[11px] label-caps text-text-dim"
          >Strength · {options.strength}% ({Math.round((options.strength / 100) * MAX_HEIGHT)} mm)</span
        >
        <Slider bind:value={options.strength} min={5} max={100} step={5} label="Strength" />
      </div>
    {/if}
    {#if options.brush === 'hill' || options.brush === 'dip' || options.brush === 'ridge'}
      <div class="flex flex-col gap-1">
        <span class="text-[11px] label-caps text-text-dim">Brush size · {options.brushSize} mm</span>
        <Slider bind:value={options.brushSize} min={100} max={1200} step={50} label="Brush size" />
      </div>
    {/if}
    {#if options.brush === 'plateau'}
      {@render segmented('Ramps down to the', SIDES, options.rampSide, v => (options.rampSide = v))}
    {/if}
  {/if}
{/snippet}

{#if showSelection}
  {@render panel(title, selectionBody)}
{:else}
  {@render panel(TOOLS.find(t => t.id === tool)?.label ?? '', toolBody)}
{/if}
