<script lang="ts">
  import MinigolfMatch from '$lib/components/minigolf/MinigolfMatch.svelte'
  import { gameState } from '$lib/gameState'
  import type { MatchProps } from '../types'

  let {
    snapshot,
    turn,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    onrolled,
    settings,
    host,
    manual,
    send,
  }: MatchProps = $props()
  const game = $derived(gameState(snapshot).minigolf)
</script>

{#if game}
  <MinigolfMatch
    {turn}
    {game}
    players={snapshot.players}
    darts={game.currentVisitDarts}
    {canThrow}
    {locked}
    {canUndo}
    {next}
    {onUndo}
    {onNext}
    {onBoardClick}
    {onrolled}
    {settings}
    {host}
    {manual}
    onNextHole={() => send({ type: 'minigolf_next_hole' })}
  />
{/if}
