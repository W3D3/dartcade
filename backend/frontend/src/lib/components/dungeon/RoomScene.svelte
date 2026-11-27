<script lang="ts">
  // The in-run screens (a fight or the boss, treasure, rest, event, the run's end) as the router's
  // scenes: each gets the game, the names and the controls it needs from MatchProps
  import type { MatchProps } from '$lib/components/match/types'
  import { gameState } from '$lib/gameState'
  import BattleScreen from './BattleScreen.svelte'
  import EventScreen from './EventScreen.svelte'
  import RestScreen from './RestScreen.svelte'
  import RunEndScreen from './RunEndScreen.svelte'
  import TreasureScreen from './TreasureScreen.svelte'

  let props: MatchProps = $props()
  const game = $derived(gameState(props.snapshot).dungeon)
  const names = $derived(props.snapshot.players.map(p => p.name))
  const throwing = $derived({ ...props, onDart: props.canThrow ? props.onDart : () => {} })
  const choosing = $derived({ names, mySeats: props.snapshot.mySeats, host: props.host, viewOnly: props.viewOnly, send: props.send })
</script>

{#if game}
  <div class="relative h-full">
    {#if game.phase === 'battle' && game.battle}
      <BattleScreen {game} battle={game.battle} {names} {...throwing} />
    {:else if game.phase === 'treasure'}
      <TreasureScreen {game} {...choosing} />
    {:else if game.phase === 'rest'}
      <RestScreen {game} {names} {...throwing} />
    {:else if game.phase === 'event'}
      <EventScreen {game} {...choosing} />
    {:else if game.phase === 'ended'}
      <RunEndScreen {game} {names} {...props} />
    {/if}
    {#if props.host && !props.viewOnly && game.phase !== 'ended'}
      <!-- DEV until the run is balanced: walks a run to its end without playing each room -->
      <button
        type="button"
        class="absolute bottom-2 left-2 rounded-lg border-2 border-dashed border-dg-hp bg-dg-bg px-3 py-1 font-display text-sm font-bold uppercase text-dg-hp"
        onclick={() => props.send({ type: 'dungeon_dev_resolve' })}>DEV: resolve this room</button
      >
    {/if}
  </div>
{/if}
