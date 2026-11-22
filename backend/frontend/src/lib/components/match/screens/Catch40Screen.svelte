<script lang="ts">
  import Catch40Match from '$lib/components/catch40/Catch40Match.svelte'
  import { whoOf } from '$lib/face'
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '../types'

  let {
    snapshot,
    mv,
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
    settings,
    keypad,
    viewOnly,
  }: MatchProps = $props()
  const game = $derived(gameState(snapshot).catch40)
</script>

{#if game}
  <Catch40Match
    {turn}
    {game}
    players={snapshot.players}
    who={whoOf(snapshot)}
    darts={game.currentVisitDarts}
    {layout}
    {canThrow}
    {locked}
    {canUndo}
    {next}
    {onUndo}
    {onNext}
    {onBoardClick}
    {onCorrect}
    {onDartMove}
    {settings}
    checkout={mv.checkout}
    {keypad}
    onDart={canThrow ? onDart : () => {}}
    {viewOnly}
  />
{/if}
