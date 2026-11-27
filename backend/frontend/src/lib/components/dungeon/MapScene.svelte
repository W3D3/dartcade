<script lang="ts">
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '$lib/components/match/types'
  import MapScreen from './MapScreen.svelte'

  let props: MatchProps = $props()
  const game = $derived(gameState(props.snapshot).dungeon)
</script>

{#if game}<MapScreen
    {...props}
    {game}
    names={props.snapshot.players.map(p => p.name)}
    onDart={props.canThrow ? props.onDart : () => {}}
  />{/if}
