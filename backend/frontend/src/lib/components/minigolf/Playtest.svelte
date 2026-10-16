<!--
  A minigolf hole played in 3D: the dartboard to aim, a 3D-physics putt, stroke count, and
  Reset/Undo/Replay. Shared by the admin bench (its default 3D view + 3D physics) and the hole
  editor's "Test putt" panel. Picking a different hole (or editing the current one) resets
  the ball to its tee.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import {
    aimDial,
    aimLines,
    aimPreview,
    benchBall,
    BUTTON,
    canShoot,
    finishShot,
    initBench,
    playShot,
    playReplay,
    putt3d,
    warmShots,
    startShot,
    undoShot,
    withHeight,
    type BenchState,
    type Pt3,
  } from '$lib/minigolf/bench'
  import type { Physics } from '$shared/minigolf/physics'
  import type { Hole } from '$shared/minigolf/types'

  let {
    hole,
    physics,
    assist = true,
    felt = 'checker',
    shading = 'toon',
    freeCamera = false,
    relief = 1,
  }: {
    hole: Hole
    physics: Physics
    /** Snaps the aim to the cup within the physics's assist angle. */
    assist?: boolean
    felt?: 'stripes' | 'checker'
    shading?: 'toon' | 'smooth'
    freeCamera?: boolean
    relief?: number
  } = $props()

  // The physics runs in a worker: start it, and its Rapier load, before the first putt
  onMount(warmShots)

  const start = untrack(() => initBench(hole))
  let bench = $state<BenchState>(start)
  /** Where the ball is drawn (and its height): follows the path while a shot rolls. */
  let shown3 = $state<Pt3>(untrack(() => benchBall(start, hole)))
  const show = () => (shown3 = benchBall(bench, hole))
  let replaying = $state(false)
  let hover = $state<{ x: number; y: number } | null>(null)
  /** The chase camera: the rolling path and the playback frame. */
  let chase = $state<{ path: Pt3[]; at: number } | null>(null)
  /** The aim dial and reach rings around the ball. */
  const aim3d = $derived(aimDial(bench, physics))
  const preview = $derived.by(() => aimPreview(bench, hole, physics, hover, assist))
  // Derived, so the 3D view lays the line out again only when it changes
  const aims3d = $derived(aimLines(preview))

  // A new hole (picked, or edited): back to the tee. Reads only `hole`: reading `bench` here
  // too (e.g. via show()) would make this effect depend on its own write and loop forever.
  $effect(() => {
    const fresh = initBench(hole)
    bench = fresh
    shown3 = benchBall(fresh, hole)
  })

  function undo(): void {
    bench = undoShot(bench)
    show()
  }

  function toTee(): void {
    bench = initBench(hole)
    show()
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function onFrame(ball: Pt3, c: { path: Pt3[]; at: number }): void {
    shown3 = ball
    chase = c
  }

  async function shoot(coords: { x: number; y: number }): Promise<void> {
    if (!canShoot(bench) || replaying) return
    const from = bench.ball
    bench = startShot(bench)
    const result = await putt3d(hole, physics, from, coords, assist)
    if (result) {
      await playShot(result.path, onFrame, reducedMotion())
      chase = null
    }
    bench = finishShot(bench, result, from)
    show()
  }

  /** Plays the last shot's path again, then puts the ball back where it rests. */
  async function replay(): Promise<void> {
    const shot = bench.lastShot
    if (bench.rolling || replaying || !shot) return
    replaying = true
    const path = shot.path.map(p => withHeight(hole, p))
    await playReplay(path, onFrame, reducedMotion())
    chase = null
    replaying = false
    show()
  }

  function onBoardHover(coords: { x: number; y: number } | null): void {
    hover = coords
  }

  function onBoardClick(hit: { coords: { x: number; y: number } }): void {
    void shoot(hit.coords)
  }
</script>

<div class="flex min-h-0 flex-grow flex-col gap-4">
  <div class="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0 [&>*]:shrink-0">
    <button type="button" class={BUTTON} onclick={toTee} disabled={bench.rolling}>Reset to tee</button>
    <button type="button" class={BUTTON} onclick={undo} disabled={bench.rolling || bench.history.length === 0}>Undo</button>
    <button type="button" class={BUTTON} onclick={replay} disabled={bench.rolling || replaying || !bench.lastShot}>Replay</button>
    <span class="ml-auto font-display font-bold text-[24px] uppercase md:text-[28px]" data-testid="strokes" aria-live="polite">
      {#if bench.holed}Holed in {bench.strokes}{:else}Strokes {bench.strokes}{/if}
    </span>
  </div>
  <div class="grid gap-4 grid-cols-1 lg:min-h-0 lg:flex-grow lg:gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <!-- On phones the hole and the board share the screen, so aiming and the roll both show -->
    <div class="h-[34dvh] lg:h-auto lg:min-h-0 rounded-2xl bg-bg-deep overflow-hidden">
      {#await import('$lib/components/minigolf/Hole3D.svelte') then { default: Hole3D }}
        <Hole3D
          {hole}
          ball={shown3}
          follow={chase}
          {freeCamera}
          wallThickness={physics.wallThickness}
          {felt}
          {shading}
          {relief}
          aim={aim3d}
          aims={aims3d}
        />
      {/await}
    </div>
    <div class="flex flex-col items-center gap-3 lg:min-h-0">
      <div class="w-full max-w-[min(520px,34dvh)] lg:max-w-[520px]">
        <DartBoard {onBoardClick} {onBoardHover} />
      </div>
      <p class="m-0 text-[14px] text-text-muted text-center">
        Angle from the bull = direction · distance = power · bull putts at the cup · off the board is a miss
      </p>
    </div>
  </div>
</div>
