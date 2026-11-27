<script lang="ts">
  // Dungeon's match screen: the scene the run is in. The finished run's summary with its buttons is
  // GameDisplay's (as a mission's result); while the deciding visit waits for Finish it shows here.
  import MapScreen from '$lib/components/dungeon/MapScreen.svelte'
  import PartyScreen from '$lib/components/dungeon/PartyScreen.svelte'
  import PlaceholderScene from '$lib/components/dungeon/PlaceholderScene.svelte'
  import RunSummary from '$lib/components/dungeon/RunSummary.svelte'
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '../types'

  let props: MatchProps = $props()
  const game = $derived(gameState(props.snapshot).dungeon)
  const names = $derived(props.snapshot.players.map(p => p.name))
</script>

{#if game?.phase === 'setup'}
  <PartyScreen {game} {names} mySeats={props.snapshot.mySeats} host={props.host} viewOnly={props.viewOnly} send={props.send} />
{:else if game?.phase === 'map'}
  <MapScreen {game} {names} {...props} onDart={props.canThrow ? props.onDart : () => {}} />
{:else if game?.summary}
  <main class="h-full overflow-y-auto bg-dg-bg p-4 md:p-5">
    <RunSummary summary={game.summary} {names} darts={game.totalDarts} />
  </main>
{:else if game}
  <PlaceholderScene {...props} />
{/if}
