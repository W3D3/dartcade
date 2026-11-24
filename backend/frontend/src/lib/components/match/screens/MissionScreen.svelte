<script lang="ts">
  // Stand-in until the Mission-Play screen (Missions part 2): the steps of the player up and how far each is.
  import { stepTitle } from '$shared/missions/describe'
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '../types'

  let { snapshot }: MatchProps = $props()
  const game = $derived(gameState(snapshot).mission)
  const run = $derived(game?.runs[game.currentPlayer])
</script>

{#if game && run}
  <main class="mx-auto flex max-w-xl flex-col gap-2 p-4">
    <h1 class="text-lg font-semibold">{game.mission.name} · {snapshot.players[game.currentPlayer]?.name}</h1>
    <ol class="flex flex-col gap-1">
      {#each game.mission.steps as step, i (i)}
        <li class:font-semibold={i === run.active}>
          {stepTitle(step)} · {run.steps[i].progress.value}/{run.steps[i].progress.of}
        </li>
      {/each}
    </ol>
  </main>
{/if}
