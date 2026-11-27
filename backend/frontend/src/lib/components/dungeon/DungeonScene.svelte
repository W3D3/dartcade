<script lang="ts">
  // Dungeon's screen router: the run's scene (sceneOf) picks the screen. A new screen is one line here,
  // a component taking MatchProps; the ones not built yet show the placeholder.
  import type { Component } from 'svelte'
  import type { MatchProps } from '$lib/components/match/types'
  import { sceneOf, type SceneKey } from '$lib/dungeon/view'
  import { gameState } from '$lib/gameState'
  import MapScene from './MapScene.svelte'
  import PartyScene from './PartyScene.svelte'
  import PlaceholderScene from './PlaceholderScene.svelte'
  import SummaryScene from './SummaryScene.svelte'

  const SCENES: Record<SceneKey, Component<MatchProps>> = {
    party: PartyScene,
    map: MapScene,
    battle: PlaceholderScene,
    boss: PlaceholderScene,
    treasure: PlaceholderScene,
    rest: PlaceholderScene,
    event: PlaceholderScene,
    victory: SummaryScene,
    defeat: SummaryScene,
    summary: SummaryScene,
  }

  let props: MatchProps = $props()
  const game = $derived(gameState(props.snapshot).dungeon)
  const Scene = $derived(game ? SCENES[sceneOf(game)] : null)
</script>

{#if Scene}<Scene {...props} />{/if}
