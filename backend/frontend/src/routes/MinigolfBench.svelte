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
  import HoleView from '$lib/components/minigolf/HoleView.svelte'
  import { playPath } from '$lib/minigolf/animate'
  import { canShoot, finishShot, initBench, startShot, type BenchState } from '$lib/minigolf/bench'
  import { COURSES } from '$shared/minigolf/courses/index'
  import { DEFAULT_PHYSICS, type Physics } from '$shared/minigolf/physics'
  import { shotFromDart } from '$shared/minigolf/shot'
  import { simulateShot } from '$shared/minigolf/simulate'
  import type { Pt } from '$shared/minigolf/types'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let courseId = $state(COURSES[0].id)
  let holeIdx = $state(0)
  const course = $derived(COURSES.find(c => c.id === courseId) ?? COURSES[0])
  const hole = $derived(course.holes[Math.min(holeIdx, course.holes.length - 1)])
  let physics = $state<Physics>({ ...DEFAULT_PHYSICS })
  let bench = $state<BenchState>(initBench(COURSES[0].holes[0]))
  /** Where the ball is drawn: follows the path while a shot rolls. */
  let shown = $state<Pt>(COURSES[0].holes[0].tee)

  function toTee(): void {
    bench = initBench(hole)
    shown = hole.tee
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  async function shoot(coords: { x: number; y: number }): Promise<void> {
    if (!canShoot(bench)) return
    const shot = shotFromDart(coords, bench.ball, hole.cup.at, physics)
    const from = bench.ball
    bench = startShot(bench)
    const result = shot ? simulateShot(hole, physics, from, shot) : null
    if (result) await playPath(result.path, p => (shown = p), reducedMotion())
    bench = finishShot(bench, result)
    shown = bench.ball
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
    <main class="flex min-h-0 flex-grow flex-col gap-4 box-border p-4 md:p-[28px_32px]">
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="m-0 mr-2 font-display font-bold text-[36px] leading-none uppercase tracking-[0.02em]">Minigolf bench</h1>
        <label class="flex items-center gap-2 text-[15px] text-text-muted">
          Course
          <select
            class={SELECT}
            bind:value={courseId}
            onchange={() => {
              holeIdx = 0
              toTee()
            }}
          >
            {#each COURSES as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
        </label>
        <label class="flex items-center gap-2 text-[15px] text-text-muted">
          Hole
          <select class={SELECT} bind:value={holeIdx} onchange={toTee}>
            {#each course.holes as h, i (h.id)}<option value={i}>{i + 1}. {h.name} · par {h.par}</option>{/each}
          </select>
        </label>
        <button type="button" class={BUTTON} onclick={toTee} disabled={bench.rolling}>Reset to tee</button>
        <span class="ml-auto font-display font-bold text-[28px] uppercase" data-testid="strokes" aria-live="polite">
          {#if bench.holed}Holed in {bench.strokes}{:else}Strokes {bench.strokes}{/if}
        </span>
      </header>
      <div class="grid min-h-0 flex-grow gap-6 grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div class="min-h-[50vh] lg:min-h-0 rounded-2xl bg-bg-deep overflow-hidden">
          <HoleView {hole} ball={shown} wallThickness={physics.wallThickness} />
        </div>
        <div class="flex min-h-0 flex-col items-center justify-center gap-3">
          <div class="w-full max-w-[520px]">
            <DartBoard {onBoardClick} />
          </div>
          <p class="m-0 text-[14px] text-text-muted text-center">
            Angle from the bull = direction · distance = power · bull putts at the cup · off the board is a miss
          </p>
        </div>
      </div>
    </main>
  {/if}
</Layout>
