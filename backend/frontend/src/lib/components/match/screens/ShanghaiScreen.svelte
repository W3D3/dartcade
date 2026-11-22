<script lang="ts">
  import ShanghaiMatch from '$lib/components/shanghai/ShanghaiMatch.svelte'
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
  const game = $derived(gameState(snapshot).shanghai)
</script>

{#if game}
  <ShanghaiMatch
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
