<script lang="ts">
  import MissionMatch from '$lib/components/missions/MissionMatch.svelte'
  import { currentUser } from '$lib/auth'
  import { whoOf } from '$lib/face'
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '../types'

  let {
    snapshot,
    layout,
    turn,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    onCorrect,
    onDartMove,
    onDart,
    send,
    keypad,
    viewOnly,
    myTurn,
  }: MatchProps = $props()
  const game = $derived(gameState(snapshot).mission)
</script>

{#if game}
  <MissionMatch
    {game}
    who={whoOf(snapshot)}
    viewerId={$currentUser?.id ?? null}
    {layout}
    {turn}
    {canThrow}
    {locked}
    {canUndo}
    {next}
    {onUndo}
    {onNext}
    {onBoardClick}
    {onCorrect}
    {onDartMove}
    onDart={canThrow ? onDart : () => {}}
    {send}
    {myTurn}
    {keypad}
    {viewOnly}
  />
{/if}
