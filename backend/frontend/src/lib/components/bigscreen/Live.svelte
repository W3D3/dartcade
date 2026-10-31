<script lang="ts">
  // The live game: the match screen's own components, view only, under the big screen's header (minigolf: as it is).
  // Lives in the frame (routes/BigScreenFrame.svelte), so its media queries see the frame's window.
  import BullOffPanel from '$lib/components/BullOffPanel.svelte'
  import HiloMatch from '$lib/components/hilo/HiloMatch.svelte'
  import MinigolfMatch from '$lib/components/minigolf/MinigolfMatch.svelte'
  import P121Match from '$lib/components/p121/P121Match.svelte'
  import ScoreMatch from '$lib/components/ScoreMatch.svelte'
  import { noop, VIEW_ONLY } from '$lib/bigscreen/viewOnly'
  import type { GameSettings } from '$lib/gameSettings'
  import { getGameView } from '$lib/gameViews'
  import { bullOffOf, gameState } from '$lib/gameState'
  import { matchLayout } from '$lib/matchLayout'
  import { matchView } from '$lib/matchView'
  import { isNarrowMatch, isPhone, isPortrait } from '$lib/viewport'
  import { sharedBoard } from '$lib/winScreen'
  import type { VisitHistory } from '$lib/visitHistory'
  import type { Snapshot } from '$lib/ws'
  import BigHeader from './BigHeader.svelte'
  import type { BoardState } from '$lib/bigscreen/frame'
  import FallbackCard from './FallbackCard.svelte'

  let {
    snapshot,
    board,
    settings,
    history,
    onrolled,
  }: {
    snapshot: Snapshot
    board: BoardState
    settings: GameSettings
    history: VisitHistory
    onrolled?: (key: string) => void
  } = $props()

  const current = $derived(gameState(snapshot))
  const { x01, atc, p121, hilo, minigolf } = $derived(current)
  // The kiosk always shows the finish to aim at
  const shown = $derived({ ...settings, checkoutSuggestions: true })
  const mv = $derived(matchView(snapshot, history, shown))
  const layout = $derived(matchLayout(snapshot.players.length, $isPhone, mv.teams.length > 0, $isNarrowMatch, $isPortrait))
  const view = $derived(getGameView(snapshot.gameId))
  const bullOff = $derived(bullOffOf(current))
</script>

{#if minigolf}
  <MinigolfMatch
    game={minigolf}
    players={snapshot.players}
    darts={minigolf.currentVisitDarts}
    canThrow={false}
    locked={true}
    canUndo={false}
    next={VIEW_ONLY.next}
    onUndo={noop}
    onNext={noop}
    onBoardClick={noop}
    host={false}
    manual={false}
    onNextHole={noop}
    {onrolled}
    settings={shown}
  />
{:else}
  <BigHeader title={view.title} meta={view.meta(snapshot)} board={sharedBoard(snapshot)} bm={board} />
  {#if bullOff}
    <BullOffPanel players={snapshot.players} bots={snapshot.seats.map(s => s.bot)} {bullOff} manual={false} send={noop} viewOnly />
  {:else if x01 || atc}
    <ScoreMatch {snapshot} {mv} {layout} settings={shown} viewOnly />
  {:else if p121}
    <P121Match
      {...VIEW_ONLY}
      game={p121}
      players={snapshot.players}
      darts={p121.currentVisitDarts}
      {layout}
      locked={p121.visitLocked}
      settings={shown}
      checkout={mv.checkout}
    />
  {:else if hilo}
    <HiloMatch {...VIEW_ONLY} game={hilo} players={snapshot.players} darts={hilo.currentVisitDarts} {layout} locked={hilo.visitLocked} />
  {:else}
    <FallbackCard {snapshot} />
  {/if}
{/if}
