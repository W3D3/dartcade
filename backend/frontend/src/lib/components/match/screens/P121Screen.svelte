<script lang="ts">
  import P121Match from '$lib/components/p121/P121Match.svelte'
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
    send,
    settings,
    keypad,
    viewOnly,
  }: MatchProps = $props()
  const game = $derived(gameState(snapshot).p121)
</script>

{#if game}
  <P121Match
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
    onGiveUp={() => send({ type: 'p121_give_up' })}
    {settings}
    checkout={mv.checkout}
    {keypad}
    onDart={canThrow ? onDart : () => {}}
    {viewOnly}
  />
{/if}
