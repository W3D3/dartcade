<script lang="ts">
  // The run is over (Dungeon-Pixel-Victory, -Defeat and their phone boards): won when the boss fell,
  // lost when the party did. While the deciding visit waits for Finish: the result, the visit that
  // decided it, the run summary and Finish. Once finished GameDisplay shows the summary with its buttons.
  import type { DungeonGame } from '$lib/api/game-ws'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import type { MatchControls } from '$lib/components/match/types'
  import { traceLines } from '$lib/dungeon/battle'
  import RunSummary from './RunSummary.svelte'

  let {
    game,
    names,
    canUndo,
    next,
    onUndo,
    onNext,
    viewOnly = false,
  }: Pick<MatchControls, 'canUndo' | 'next' | 'onUndo' | 'onNext' | 'viewOnly'> & { game: DungeonGame; names: string[] } = $props()
  const won = $derived(game.outcome === 'victory')
  const log = $derived(won && game.trace ? traceLines(game.trace, names[game.trace.seat] ?? '', []) : [])
</script>

<main
  class="flex h-full flex-col items-center gap-4 overflow-y-auto bg-dg-bg p-4 text-center text-dg-text md:p-8"
  data-testid="dungeon-end"
>
  <h2 class="font-display text-5xl font-bold uppercase {won ? 'text-dg-gold' : 'text-dg-hp'}">{won ? 'Victory' : 'Defeat'}</h2>
  <p class="text-lg">{won ? 'The Dungeon Warden falls.' : 'The party has fallen.'}</p>
  {#if log.length}
    <ol class="max-w-2xl text-left font-mono text-sm" data-testid="trace">
      {#each log as line, i (i)}<li>&gt; {line}</li>{/each}
    </ol>
  {/if}
  {#if !viewOnly}
    <div class="w-full max-w-md">
      <ControlBar {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} {onUndo} {onNext} />
    </div>
  {/if}
  {#if game.summary}
    <div class="w-full text-left"><RunSummary summary={game.summary} {names} darts={game.totalDarts} /></div>
  {/if}
</main>
