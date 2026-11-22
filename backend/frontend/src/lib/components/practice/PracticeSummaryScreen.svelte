<!--
  A practice session's summary for a snapshot: the one place that picks the mode's summary
  component, its saved detail and its standings. The match page and the big screen's result both
  render it; a new practice mode is one more branch here (and in `hasPracticeSummary`).
-->
<script lang="ts">
  import type { GameDetail } from '$lib/api'
  import type { Snapshot } from '$lib/api/game-ws'
  import Catch40Summary from '$lib/components/catch40/Catch40Summary.svelte'
  import P121Summary from '$lib/components/p121/P121Summary.svelte'
  import type { PracticeSummaryBase } from '$lib/components/practice/types'
  import { snapshotStandings as catch40Standings } from '$lib/catch40/summary'
  import { snapshotStandings as p121Standings } from '$lib/p121/summary'

  let {
    snapshot,
    saved,
    ...rest
  }: {
    snapshot: Snapshot
    /** The saved game (its detail), once loaded; null before, and for a spectator. */
    saved: GameDetail | null
  } & Omit<PracticeSummaryBase, 'players'> = $props()
</script>

{#if snapshot.gameId === 'catch40'}
  <Catch40Summary
    {...rest}
    players={snapshot.players}
    detail={saved?.detail.mode === 'catch40' ? saved.detail : null}
    standings={catch40Standings(snapshot.game, snapshot.players, snapshot.results)}
  />
{:else if snapshot.gameId === 'p121'}
  <P121Summary
    {...rest}
    players={snapshot.players}
    detail={saved?.detail.mode === 'p121' ? saved.detail : null}
    missRule={snapshot.game.cfg.missRule}
    startTarget={snapshot.game.cfg.startTarget}
    standings={p121Standings(snapshot.game, snapshot.players, snapshot.results)}
  />
{/if}
