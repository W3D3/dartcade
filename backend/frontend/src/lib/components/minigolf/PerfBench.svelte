<!--
  The 3D view's benchmark (#/admin/minigolf?bench=1): the whole
  window, a fixed set of holes, each aimed at (the preview line turning), left still, chased along
  a made-up roll and circled; then the frame times per hole and phase as JSON, to copy (and on
  window.__minigolfBench for the Playwright script, e2e/perf/). The still phase counts the frames
  drawn while nothing moves: none, once the view has settled.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import Hole3D from './Hole3D.svelte'
  import { glRenderer, summarize, type FrameSample } from '$lib/minigolf/perf'
  import { hrefs } from '$lib/routes'
  import { heightAt } from '$shared/minigolf/3d/ground'
  import { COURSES } from '$shared/minigolf/courses/index'
  import { BALL_R, type Hole, type PathPt, type Pt } from '$shared/minigolf/types'

  /** A plain hole, the most ground (Sidehill), the most rail (Figure Eight, 328 outline points) and
   *  a big curved one (High Water). */
  const HOLES: Hole[] = (
    [
      ['greenhorn', 0],
      ['greenhorn', 5],
      ['kingfisher', 6],
      ['kingfisher', 8],
    ] as const
  ).map(([id, i]) => COURSES.find(c => c.id === id)?.holes[i] ?? COURSES[0].holes[0])
  const ROLL_S = 4
  const PHASES = [
    { phase: 'aim', seconds: 3 },
    { phase: 'still', seconds: 2 },
    { phase: 'follow', seconds: ROLL_S },
    { phase: 'orbit', seconds: 3 },
  ] as const
  /** Frames after a hole is (re)built that don't count: the build and shader compiles. */
  const SETTLE_MS = 500

  /** A made-up roll from the tee straight to the cup (through anything in the way), at 60 Hz over
   *  `seconds`, resting on the ground: the same on every run. */
  function rollPath(hole: Hole, seconds: number): PathPt[] {
    const n = Math.round(seconds * 60)
    return Array.from({ length: n + 1 }, (_, k) => {
      // Eases out, as a putt slows down
      const t = 1 - (1 - k / n) ** 2
      const x = hole.tee[0] + (hole.cup.at[0] - hole.tee[0]) * t
      const y = hole.tee[1] + (hole.cup.at[1] - hole.tee[1]) * t
      return [x, y, heightAt(hole, [x, y]) + BALL_R]
    })
  }

  let step = $state(0)
  let at = $state(0)
  let result = $state<string | null>(null)
  let copied = $state(false)

  const steps = HOLES.flatMap(hole => PHASES.map(p => ({ hole, ...p })))
  const current = $derived(steps[Math.min(step, steps.length - 1)])
  const path = $derived(rollPath(current.hole, ROLL_S))
  const ball = $derived<PathPt>(current.phase === 'follow' ? path[Math.min(path.length - 1, Math.floor(at))] : path[0])
  // Aiming: the dial, and a preview line turning a full circle every 4 s
  const aim = $derived(current.phase === 'aim' ? { at: current.hole.tee, treble: 1200, double: 2400 } : null)
  const aims = $derived.by(() => {
    if (current.phase !== 'aim') return []
    const a = (at / 240) * 2 * Math.PI
    const dir: Pt = [Math.cos(a), Math.sin(a)]
    return [{ from: current.hole.tee, dir, roll: 1800, current: true }]
  })

  const samples: FrameSample[][] = steps.map(() => [])
  let stepStart = 0
  function onframe(s: FrameSample): void {
    const since = performance.now() - stepStart
    if (result || (current.phase === 'aim' && since < SETTLE_MS)) return
    samples[step].push(s)
  }

  onMount(() => {
    let raf = 0
    stepStart = performance.now()
    const tick = (now: number) => {
      const elapsed = now - stepStart
      at = (elapsed / 1000) * 60
      if (elapsed >= current.seconds * 1000 + (current.phase === 'aim' ? SETTLE_MS : 0)) {
        if (step === steps.length - 1) return finish()
        step++
        stepStart = now
        at = 0
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  })

  function finish(): void {
    const gl = document.querySelector<HTMLCanvasElement>('[data-testid="hole-3d"] canvas')?.getContext('webgl2') ?? null
    const last = samples.flat().at(-1)
    const drawn = steps.map((s, k) => ({ ...s, ...summarize(samples[k]) }))
    const report = {
      device: {
        userAgent: navigator.userAgent,
        gpu: gl ? glRenderer(gl) : null,
        devicePixelRatio,
        window: `${innerWidth}×${innerHeight}`,
        canvas: last ? `${last.canvas[0]}×${last.canvas[1]}` : null,
        cores: navigator.hardwareConcurrency,
      },
      // The moving phases; the still ones only say how many frames were drawn
      all: summarize(samples.filter((_, k) => steps[k].phase !== 'still').flat()),
      stillFrames: drawn.filter(s => s.phase === 'still').map(s => s.frames),
      steps: drawn.map(({ hole, seconds: _, ...s }) => ({ ...s, hole: hole.name })),
    }
    Object.assign(window, { __minigolfBench: report })
    result = JSON.stringify(report, null, 2)
  }

  async function copy(): Promise<void> {
    if (!result) return
    await navigator.clipboard.writeText(result)
    copied = true
  }
</script>

<div class="fixed inset-0 z-50 bg-bg-deep">
  {#if result}
    <div class="absolute inset-0 overflow-auto p-4 flex flex-col gap-3">
      <div class="flex gap-2">
        <button type="button" class="h-9 rounded-md border border-line-2 bg-surface-2 px-3 text-text" onclick={copy}>
          {copied ? 'Copied' : 'Copy result'}
        </button>
        <a class="h-9 rounded-md border border-line-2 bg-surface-2 px-3 text-text leading-9" href={hrefs.adminMinigolf()}
          >Back to the bench</a
        >
      </div>
      <pre class="text-mono-sm text-text whitespace-pre-wrap" data-testid="bench-result">{result}</pre>
    </div>
  {:else}
    <Hole3D
      hole={current.hole}
      {ball}
      {aim}
      {aims}
      follow={current.phase === 'follow' ? { path, at } : null}
      orbit={current.phase === 'orbit' ? current.hole.cup.at : null}
      {onframe}
    />
    <p class="absolute bottom-2 left-2 text-label text-text">
      Benchmark {step + 1}/{steps.length}: {current.hole.name}, {current.phase}
    </p>
  {/if}
</div>
