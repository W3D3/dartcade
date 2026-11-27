<script lang="ts">
  // Dungeon's screen router: the run's scene (sceneOf) picks the screen. A new screen is one line here,
  // a component taking MatchProps.
  import type { Component } from 'svelte'
  import type { MatchProps } from '$lib/components/match/types'
  import { sceneOf, type SceneKey } from '$lib/dungeon/view'
  import { gameState } from '$lib/gameState'
  import MapScene from './MapScene.svelte'
  import PartyScene from './PartyScene.svelte'
  import RoomScene from './RoomScene.svelte'
  import SummaryScene from './SummaryScene.svelte'

  const SCENES: Record<SceneKey, Component<MatchProps>> = {
    party: PartyScene,
    map: MapScene,
    battle: RoomScene,
    boss: RoomScene,
    treasure: RoomScene,
    rest: RoomScene,
    event: RoomScene,
    victory: RoomScene,
    defeat: RoomScene,
    summary: SummaryScene,
  }

  let props: MatchProps = $props()
  const game = $derived(gameState(props.snapshot).dungeon)
  const Scene = $derived(game ? SCENES[sceneOf(game)] : null)
</script>

{#if Scene}<Scene {...props} />{/if}
