<script lang="ts">
  // Test the hole: the putting bot plays it 20 times in a worker, then tells how often it reached
  // the cup and suggests a par. Any change to the hole but its par stops a test and clears its result.
  import type { BotMessage, BotRequest } from '$lib/minigolf/editor/botWorker'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { BotResult } from '$shared/minigolf/bot'
  import type { Physics } from '$shared/minigolf/physics'
  import type { Hole } from '$shared/minigolf/types'

  let { hole, physics, onpar }: { hole: Hole; physics: Physics; onpar: (par: number) => void } = $props()

  /** Seeded, so the same hole gives the same result. */
  const SEED = 1
  const ROUNDS = 20

  let worker: Worker | null = null
  let running = $state(false)
  let done = $state(0)
  let result = $state<BotResult | null>(null)
  let failed = $state(false)

  const shape = $derived(JSON.stringify({ ...hole, par: 0 }))
  // Runs again, stopping the test first, whenever the shape changes
  $effect(() => {
    if (shape) return stop
  })

  function stop(): void {
    worker?.terminate()
    worker = null
    running = false
    done = 0
    result = null
    failed = false
  }

  function fail(): void {
    stop()
    failed = true
  }

  function start(): void {
    stop()
    const w = new Worker(new URL('../../../minigolf/editor/botWorker.ts', import.meta.url), { type: 'module' })
    worker = w
    running = true
    w.onmessage = (e: MessageEvent<BotMessage>) => {
      if (w !== worker) return
      if (e.data.type === 'progress') done = e.data.done
      else if (e.data.type === 'error') fail()
      else {
        result = e.data.result
        running = false
        w.terminate()
        worker = null
      }
    }
    w.onerror = () => {
      if (w === worker) fail()
    }
    w.postMessage({ hole: $state.snapshot(hole), physics: $state.snapshot(physics), seed: SEED, rounds: ROUNDS } satisfies BotRequest)
  }
</script>

<section aria-label="Test the hole" class="flex flex-col gap-2">
  {#if running}
    <span class="text-[14px] text-text-dim">Testing the hole · {done} of {ROUNDS}</span>
    <span
      role="progressbar"
      aria-label="Testing the hole"
      aria-valuemin={0}
      aria-valuemax={ROUNDS}
      aria-valuenow={done}
      class="block h-1 overflow-hidden rounded-[2px] bg-line"
    >
      <span class="block h-full bg-accent transition-[width]" style:width="{(done / ROUNDS) * 100}%"></span>
    </span>
  {:else if result}
    <p class="m-0 text-[14px]" data-testid="bot-reached">
      {result.reached > 0 ? 'Cup reachable' : 'Cup not reached'} · {result.reached} of {result.rounds}
    </p>
    <div class="flex items-center justify-between gap-2">
      <span class="text-[14px]" data-testid="bot-par">Suggested par {result.suggestedPar}</span>
      <Button variant="outline" disabled={hole.par === result.suggestedPar} onclick={() => result && onpar(result.suggestedPar)}
        >Use as par</Button
      >
    </div>
  {:else}
    {#if failed}<p class="m-0 text-[14px] text-live-text">The test didn't finish – try again</p>{/if}
    <Button variant="outline" onclick={start}>Test the hole</Button>
  {/if}
</section>
