<script lang="ts">
  // The run summary while the deciding visit waits for Finish; once the game is over GameDisplay shows
  // it with its buttons
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '$lib/components/match/types'
  import RunSummary from './RunSummary.svelte'

  let { snapshot }: MatchProps = $props()
  const game = $derived(gameState(snapshot).dungeon)
</script>

{#if game?.summary}
  <main class="h-full overflow-y-auto bg-dg-bg p-4 md:p-5">
    <RunSummary summary={game.summary} names={snapshot.players.map(p => p.name)} darts={game.totalDarts} />
  </main>
{/if}
