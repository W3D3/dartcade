<script lang="ts">
  // Minigolf on the big screen: the match screen as it is, view only.
  import type { Snapshot } from '$lib/ws'
  import type { GameSettings } from '$lib/gameSettings'
  import { gameState } from '$lib/gameState'
  import MinigolfMatch from '$lib/components/minigolf/MinigolfMatch.svelte'

  let { snapshot, settings }: { snapshot: Snapshot; settings: GameSettings } = $props()
  const game = $derived(gameState(snapshot).minigolf)
  const noop = () => undefined
</script>

{#if game}
  <MinigolfMatch
    {game}
    players={snapshot.players}
    darts={game.currentVisitDarts}
    canThrow={false}
    locked={true}
    canUndo={false}
    next={{ prominent: false, enabled: false }}
    onUndo={noop}
    onNext={noop}
    onBoardClick={noop}
    host={false}
    manual={false}
    onNextHole={noop}
    {settings}
  />
{/if}
