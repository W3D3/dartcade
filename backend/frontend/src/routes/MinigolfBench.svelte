<!--
  Admin test bench for minigolf holes: pick a hole, click the dartboard to putt, watch the ball.
  Runs the shared core (shot, simulation) in the browser; nothing is stored.
  Design: docs/superpowers/specs/2026-10-09-minigolf-core-bench-design.md
-->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { currentUser } from '$lib/auth'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import Layout from '$lib/components/Layout.svelte'
  import HoleEditor from '$lib/components/minigolf/HoleEditor.svelte'
  import HoleView from '$lib/components/minigolf/HoleView.svelte'
  import PhysicsPanel from '$lib/components/minigolf/PhysicsPanel.svelte'
  import { Toggle } from '$lib/components/ui/toggle/index.js'
  import { heightAt } from '$shared/minigolf/3d/ground'
  import { initPhysics3d, simulateShot3d } from '$shared/minigolf/3d/physics3d'
  import { playFrames, playPath } from '$lib/minigolf/animate'
  import { benchBall, canShoot, finishShot, initBench, placeBall, startShot, undoShot, type BenchState } from '$lib/minigolf/bench'
  import { COURSES } from '$shared/minigolf/courses/index'
  import { DEFAULT_PHYSICS, type Physics } from '$shared/minigolf/physics'
  import { R } from '$shared/board'
  import { powerAt, shotFromDart } from '$shared/minigolf/shot'
  import { simulateShot } from '$shared/minigolf/simulate'
  import { BALL_R, type Hole, type PathPt, type Pt } from '$shared/minigolf/types'

  /** A point in the course (x, y) with its height (z), mm. */
  type Pt3 = [number, number, number]

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let courseId = $state(COURSES[0].id)
  let holeIdx = $state(0)
  const course = $derived(COURSES.find(c => c.id === courseId) ?? COURSES[0])
  const picked = $derived(course.holes[Math.min(holeIdx, course.holes.length - 1)])
  /** The hole as edited in the JSON editor; picking a hole drops the edit. */
  let edited = $state<Hole | null>(null)
  const hole = $derived(edited ?? picked)
  let physics = $state<Physics>({ ...DEFAULT_PHYSICS })
  let bench = $state<BenchState>(initBench(COURSES[0].holes[0]))
  /** Where the ball is drawn (and its height, for 3D): follows the path while a shot rolls. */
  let shown3 = $state<Pt3>([...COURSES[0].holes[0].tee, BALL_R])
  const shown = $derived<Pt>([shown3[0], shown3[1]])
  const show = () => (shown3 = benchBall(bench, hole))
  /** Experiments: draw the hole in 3D, and play it with 3D physics (Rapier, loaded on first use). */
  let view3d = $state<boolean>(true)
  let physics3d = $state<boolean>(true)
  let felt = $state<'stripes' | 'checker'>('checker')
  let relief = $state(1)
  let placing = $state(false)
  let debug = $state(false)
  let forces = $state(false)
  let assist = $state<boolean>(true)
  let freeCamera = $state<boolean>(false)
  let replaying = $state(false)
  // Free camera is a 3D-only toggle: leaving the 2D view switches it off, so it starts off next time
  $effect(() => {
    if (!view3d) freeCamera = false
  })
  let lastPath = $state<Pt[] | null>(null)
  let hover = $state<{ x: number; y: number } | null>(null)
  /** The 3D view's chase camera: the rolling path and the playback frame. */
  let chase = $state<{ path: Pt3[]; at: number } | null>(null)
  /** The 3D view's aim dial; its reach rings as the game works them out: a dart mid-treble, one on the double wire. */
  const aim3d = $derived(
    canShoot(bench)
      ? { at: bench.ball, treble: powerAt((R.si + R.tr) / 2, physics) * physics.maxRoll, double: powerAt(1, physics) * physics.maxRoll }
      : null,
  )
  const preview = $derived.by(() => {
    if (!hover || !canShoot(bench)) return null
    const shot = shotFromDart(hover, bench.ball, hole.cup.at, physics, assist ? hole : null)
    return shot && { from: bench.ball, ...shot, roll: shot.power * physics.maxRoll }
  })

  // Derived, so the 3D view lays the line out again only when it changes
  const aims3d = $derived(preview ? [{ ...preview, current: true }] : [])

  function undo(): void {
    bench = undoShot(bench)
    show()
  }
  function place(at: Pt): void {
    bench = placeBall(bench, at)
    show()
  }

  function onHoleEdit(h: Hole): void {
    edited = h
  }

  function pickHole(): void {
    edited = null
    toTee()
  }

  function toTee(): void {
    bench = initBench(hole)
    show()
    lastPath = null
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  async function shoot(coords: { x: number; y: number }): Promise<void> {
    if (!canShoot(bench) || replaying) return
    const shot = shotFromDart(coords, bench.ball, hole.cup.at, physics, assist ? hole : null)
    const from = bench.ball
    bench = startShot(bench)
    let result: { path: Pt3[]; rest: Pt; holed: boolean } | null = null
    if (shot) {
      if (physics3d) await initPhysics3d()
      const r = (physics3d ? simulateShot3d : simulateShot)(hole, physics, from, shot)
      result = { ...r, path: r.path.map((p: PathPt) => [p[0], p[1], p[2] ?? heightAt(hole, [p[0], p[1]]) + BALL_R]) }
    }
    lastPath = result?.path.map(p => [p[0], p[1]]) ?? null
    if (result) {
      const path = result.path
      await new Promise<void>(onDone =>
        playFrames(
          path.length,
          at => {
            shown3 = path[Math.floor(at)]
            chase = { path, at }
          },
          reducedMotion(),
          { onDone },
        ),
      )
      chase = null
    }
    bench = finishShot(bench, result, from)
    show()
  }

  /** Plays the last shot's path again, in either view, then puts the ball back where it rests. */
  async function replay(): Promise<void> {
    const shot = bench.lastShot
    if (bench.rolling || replaying || !shot) return
    replaying = true
    const path: Pt3[] = shot.path.map(p => [p[0], p[1], p[2] ?? heightAt(hole, [p[0], p[1]]) + BALL_R])
    await playPath(
      path,
      p => {
        shown3 = p
        chase = { path, at: path.indexOf(p) }
      },
      reducedMotion(),
    )
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

  const SELECT = 'h-9 rounded-[10px] border border-line-2 bg-surface-2 px-2 text-text text-[15px] font-[inherit]'
  const BUTTON =
    'h-9 rounded-[10px] border border-line-2 bg-surface-2 px-3 text-text text-[15px] font-medium font-[inherit] cursor-pointer hover:bg-surface-hover disabled:opacity-50 disabled:cursor-default'
</script>

<Layout title="Minigolf bench">
  {#if $currentUser?.isAdmin}
    <main class="flex min-h-0 flex-grow flex-col gap-4 box-border overflow-y-auto p-4 md:p-[28px_32px] lg:overflow-hidden">
      <header class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <!-- On phones the app's header already shows the title -->
          <h1 class="m-0 mr-2 hidden font-display font-bold text-[36px] leading-none uppercase tracking-[0.02em] md:block">
            Minigolf bench
          </h1>
          <label class="flex min-w-0 items-center gap-2 text-[15px] text-text-muted">
            <span class="sr-only md:not-sr-only">Course</span>
            <select
              class={SELECT}
              bind:value={courseId}
              onchange={() => {
                holeIdx = 0
                pickHole()
              }}
            >
              {#each COURSES as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </select>
          </label>
          <label class="flex min-w-0 items-center gap-2 text-[15px] text-text-muted">
            <span class="sr-only md:not-sr-only">Hole</span>
            <select class="{SELECT} min-w-0 max-w-[46vw] md:max-w-none" bind:value={holeIdx} onchange={pickHole}>
              {#each course.holes as h, i (h.id)}<option value={i}>{i + 1}. {h.name} · par {h.par}</option>{/each}
            </select>
          </label>
          <span class="ml-auto font-display font-bold text-[24px] uppercase md:text-[28px]" data-testid="strokes" aria-live="polite">
            {#if bench.holed}Holed in {bench.strokes}{:else}Strokes {bench.strokes}{/if}
          </span>
        </div>
        <!-- One row to swipe through on phones, wrapping on wider screens -->
        <div class="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0 [&>*]:shrink-0">
          <button type="button" class={BUTTON} onclick={toTee} disabled={bench.rolling}>Reset to tee</button>
          <button type="button" class={BUTTON} onclick={undo} disabled={bench.rolling || bench.history.length === 0}>Undo</button>
          <button type="button" class={BUTTON} onclick={replay} disabled={bench.rolling || replaying || !bench.lastShot}> Replay </button>
          <Toggle bind:pressed={placing} disabled={bench.rolling}>Place ball</Toggle>
          <Toggle bind:pressed={debug}>Debug</Toggle>
          <Toggle bind:pressed={forces}>Forces</Toggle>
          <label class="flex min-w-0 items-center gap-2 text-[15px] text-text-muted">
            <span class="sr-only md:not-sr-only">View</span>
            <select class={SELECT} bind:value={view3d}>
              <option value={true}>3D</option>
              <option value={false}>2D</option>
            </select>
          </label>
          <label class="flex min-w-0 items-center gap-2 text-[15px] text-text-muted">
            <span class="sr-only md:not-sr-only">Physics</span>
            <select class={SELECT} bind:value={physics3d} disabled={bench.rolling}>
              <option value={true}>3D</option>
              <option value={false}>2D</option>
            </select>
          </label>
          {#if view3d}
            <label class="flex min-w-0 items-center gap-2 text-[15px] text-text-muted">
              <span class="sr-only md:not-sr-only">Felt</span>
              <select class={SELECT} bind:value={felt}>
                <option value="checker">Checker</option>
                <option value="stripes">Stripes</option>
              </select>
            </label>
            <label class="flex items-center gap-2 text-[15px] text-text-muted">
              Relief ×{relief}
              <input type="range" min="1" max="5" step="0.5" bind:value={relief} class="w-24" />
            </label>
            <Toggle bind:pressed={freeCamera}>Free camera</Toggle>
          {/if}
          <Toggle bind:pressed={assist}>Aim assist</Toggle>
        </div>
      </header>
      <div class="grid gap-4 grid-cols-1 lg:min-h-0 lg:flex-grow lg:gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <!-- On phones the hole and the board share the screen, so aiming and the roll both show -->
        <div class="h-[34dvh] lg:h-auto lg:min-h-0 rounded-2xl bg-bg-deep overflow-hidden">
          {#if view3d}
            {#await import('$lib/components/minigolf/Hole3D.svelte') then { default: Hole3D }}
              <Hole3D
                {hole}
                ball={shown3}
                follow={chase}
                {freeCamera}
                wallThickness={physics.wallThickness}
                {felt}
                {relief}
                aim={aim3d}
                aims={aims3d}
              />
            {/await}
          {:else}
            <HoleView
              {hole}
              ball={shown}
              wallThickness={physics.wallThickness}
              onPlace={placing ? place : undefined}
              {debug}
              {forces}
              {lastPath}
              {preview}
            />
          {/if}
        </div>
        <div class="flex flex-col items-center gap-3 lg:min-h-0 lg:overflow-y-auto">
          <div class="w-full max-w-[min(520px,34dvh)] lg:max-w-[520px]">
            <DartBoard {onBoardClick} {onBoardHover} />
          </div>
          <p class="m-0 text-[14px] text-text-muted text-center">
            Angle from the bull = direction · distance = power · bull putts at the cup · off the board is a miss
          </p>
          <details class="w-full max-w-[520px] rounded-2xl bg-surface-panel p-4">
            <summary class="cursor-pointer font-display font-bold text-[20px] uppercase">Physics</summary>
            <div class="pt-3"><PhysicsPanel bind:physics /></div>
          </details>
          <details class="w-full max-w-[520px] rounded-2xl bg-surface-panel p-4">
            <summary class="cursor-pointer font-display font-bold text-[20px] uppercase">Hole JSON</summary>
            <div class="pt-3"><HoleEditor {hole} onChange={onHoleEdit} /></div>
          </details>
        </div>
      </div>
    </main>
  {/if}
</Layout>
