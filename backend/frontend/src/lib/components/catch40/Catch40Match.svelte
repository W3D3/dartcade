<!--
  The Catch 40 match screen: the shared checkout practice layout with Catch 40's card, ladder,
  session panel and checked-out strip (points for the target just made).
-->
<script lang="ts">
  import type { Catch40Game } from '$lib/api/game-ws'
  import Catch40Ladder from '$lib/components/catch40/Catch40Ladder.svelte'
  import Catch40PlayerCard from '$lib/components/catch40/Catch40PlayerCard.svelte'
  import Catch40SessionPanel from '$lib/components/catch40/Catch40SessionPanel.svelte'
  import PracticeMatch from '$lib/components/practice/PracticeMatch.svelte'
  import type { PracticeBase } from '$lib/components/practice/types'
  import { plural } from '$lib/fmt'
  import { pointsLabel, TARGETS } from '$lib/catch40/view'
  import { pointsFor } from '$shared/catch40'

  let { game, players, who, darts, next, settings, checkout, ...rest }: PracticeBase & { game: Catch40Game } = $props()

  const cp = $derived(game.currentPlayer)
  const cur = $derived(game.seats[cp])
  // Checked out: the visit waits for takeout, which starts the next target
  const made = $derived(game.phase === 'game' && cur.left === 0)
  const lastTarget = $derived(cur.tries.length + 1 >= TARGETS)
  const solo = $derived(players.length === 1)
  // A seat throws its target's second visit itself (and solo has no other seat): the button names the next visit,
  // or the next target once checked out
  const nextLabel = $derived(
    made
      ? lastTarget
        ? 'Finish'
        : solo
          ? `Next: ${cur.target + 1}`
          : next.label
      : (solo || game.nextPlayer === cp) && next.label === 'Next player'
        ? 'Next visit'
        : next.label,
  )
</script>

<PracticeMatch
  {...rest}
  {game}
  {players}
  {who}
  {darts}
  {next}
  {settings}
  {checkout}
  outMode="double"
  {nextLabel}
  phoneLadderLabel="Targets · {cur.total} points after {cur.tries.length} of {TARGETS}"
>
  {#snippet card(seat: number, variant: 'solo' | 'side' | 'phone', active: boolean, visitDarts: number, portrait: boolean)}
    <Catch40PlayerCard {game} {seat} who={who[seat]} {active} {visitDarts} {variant} {portrait} {checkout} />
  {/snippet}
  {#snippet ladder(seat: number)}<Catch40Ladder {game} {seat} variant="dots" />{/snippet}
  {#snippet panel()}<Catch40SessionPanel {game} seat={0} />{/snippet}
  {#snippet madeBody()}
    <span class="flex-1 min-w-0 flex flex-col gap-1">
      <span class="type-checkout font-bold leading-none text-accent">{pointsLabel(pointsFor(cur.target, cur.darts + darts.length))}</span>
      <span class="text-body text-text"
        >{cur.target} · {darts.map(d => d.segment.name).join(', ')} in {plural(cur.darts + darts.length, 'dart')}</span
      >
      {#if !lastTarget}<span class="text-label text-text-muted"
          >Next target <strong class="text-text">{cur.target + 1}</strong> · {cur.tries.length + 2} of {TARGETS}</span
        >{/if}
    </span>
    <!-- Solo only: in multiplayer the next dart is the next player's -->
    {#if solo && !lastTarget}<span class="shrink-0 max-w-[180px] text-right text-caption text-text-dim"
        >Take your darts out to start the next target</span
      >{/if}
  {/snippet}
</PracticeMatch>
