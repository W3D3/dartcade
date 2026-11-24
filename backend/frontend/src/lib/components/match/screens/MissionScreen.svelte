<script lang="ts">
  // Stand-in until the Mission-Play screen (Missions part 2): the steps and how far each is.
  import { stepTitle } from '$shared/missions/describe'
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '../types'

  let { snapshot }: MatchProps = $props()
  const game = $derived(gameState(snapshot).mission)
</script>

{#if game}
  <main class="mx-auto flex max-w-xl flex-col gap-2 p-4">
    <h1 class="text-lg font-semibold">{game.mission.name}</h1>
    <ol class="flex flex-col gap-1">
      {#each game.mission.steps as step, i (i)}
        <li class:font-semibold={i === game.active}>
          {stepTitle(step)} · {game.steps[i].progress.value}/{game.steps[i].progress.of}
        </li>
      {/each}
    </ol>
  </main>
{/if}
