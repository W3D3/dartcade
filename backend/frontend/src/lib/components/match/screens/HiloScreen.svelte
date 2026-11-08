<script lang="ts">
  import HiloMatch from '$lib/components/hilo/HiloMatch.svelte'
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
  const game = $derived(gameState(snapshot).hilo)
</script>

{#if game}
  <HiloMatch
    {turn}
    {game}
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
