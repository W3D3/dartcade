<script lang="ts">
  // The live game: the match screen's own components, view only, under the big screen's header (minigolf: as it is).
  // Lives in the frame (routes/BigScreenFrame.svelte), so its media queries see the frame's window.
  import { viewOnlyProps } from '$lib/bigscreen/viewOnly'
  import MatchScreen from '$lib/components/match/MatchScreen.svelte'
  import type { GameSettings } from '$lib/gameSettings'
  import { getGameView } from '$lib/gameViews'
  import { matchLayout } from '$lib/matchLayout'
  import { matchView } from '$lib/matchView'
  import { isNarrowMatch, isPhone, isPortrait } from '$lib/viewport'
  import { sharedBoard } from '$lib/winScreen'
  import type { VisitHistory } from '$lib/visitHistory'
  import type { Snapshot } from '$lib/ws'
  import BigHeader from './BigHeader.svelte'
  import type { BoardState } from '$lib/bigscreen/frame'

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

  // The kiosk always shows the finish to aim at
  const shown = $derived({ ...settings, checkoutSuggestions: true })
  const mv = $derived(matchView(snapshot, history, shown))
  const layout = $derived(matchLayout(snapshot.players.length, $isPhone, mv.teams.length > 0, $isNarrowMatch, $isPortrait))
  const view = $derived(getGameView(snapshot.gameId))
</script>

{#if snapshot.gameId !== 'minigolf'}
  <BigHeader title={view.title} meta={view.meta(snapshot)} board={sharedBoard(snapshot)} bm={board} />
{/if}
<MatchScreen {snapshot} {mv} {layout} settings={shown} {onrolled} {...viewOnlyProps(snapshot)} />
