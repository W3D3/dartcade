<script lang="ts">
  // The match screen under the header: the bull off while it decides who throws first, else the game's own screen.
  // GameDisplay plays it; the big screen shows it view only (lib/bigscreen/viewOnly.ts).
  import type { Component } from 'svelte'
  import BullOffPanel from '$lib/components/BullOffPanel.svelte'
  import { whoOf } from '$lib/face'
  import { bullOffOf, gameState } from '$lib/gameState'
  import { MATCH_SCREENS } from '$lib/gameViews/match'
  import type { MatchProps } from './types'

  let { settings = $bindable(), correcting = $bindable(null), ...props }: MatchProps = $props()

  const bullOff = $derived(bullOffOf(gameState(props.snapshot)))
  // A game id from a newer server has no entry
  const screens: Partial<Record<string, Component<MatchProps>>> = MATCH_SCREENS
  const Screen = $derived(screens[props.snapshot.gameId])
</script>

{#if bullOff}
  <BullOffPanel
    players={props.snapshot.players}
    who={whoOf(props.snapshot)}
    {bullOff}
    manual={props.manual}
    canThrow={props.myTurn}
    send={props.send}
    viewOnly={props.viewOnly}
  />
{:else if Screen}
  <Screen {...props} bind:settings bind:correcting />
{:else}
  <main class="flex-grow flex items-center justify-center">
    <p class="text-text-muted">Unsupported game</p>
  </main>
{/if}
