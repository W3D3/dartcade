<script lang="ts">
  import CricketMatch from '$lib/components/cricket/CricketMatch.svelte'
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
    keypad,
    viewOnly,
  }: MatchProps = $props()
  const game = $derived(gameState(snapshot).cricket)
</script>

{#if game}
  <CricketMatch
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
    {keypad}
    onDart={canThrow ? onDart : () => {}}
    {viewOnly}
  />
{/if}
