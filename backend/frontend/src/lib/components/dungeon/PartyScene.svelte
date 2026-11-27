<script lang="ts">
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '$lib/components/match/types'
  import PartyScreen from './PartyScreen.svelte'

  let { snapshot, host, viewOnly, send }: MatchProps = $props()
  const game = $derived(gameState(snapshot).dungeon)
</script>

{#if game}<PartyScreen {game} names={snapshot.players.map(p => p.name)} mySeats={snapshot.mySeats} {host} {viewOnly} {send} />{/if}
