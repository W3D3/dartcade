<!--
  The 121 Checkout match screen (P121-Game, -Made, -Missed, -Phone): the shared checkout practice
  layout with 121's card, ladder, session panel, checked-out strip and Give up.
-->
<script lang="ts">
  import type { P121Game } from '$lib/api/game-ws'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import P121Ladder from '$lib/components/p121/P121Ladder.svelte'
  import P121PlayerCard from '$lib/components/p121/P121PlayerCard.svelte'
  import P121SessionPanel from '$lib/components/p121/P121SessionPanel.svelte'
  import PracticeMatch from '$lib/components/practice/PracticeMatch.svelte'
  import type { PracticeBase } from '$lib/components/practice/types'
  import { plural } from '$lib/fmt'

  let {
    game,
    players,
    who,
    darts,
    next,
    settings,
    checkout,
    canThrow,
    locked,
    onGiveUp,
    ...rest
  }: PracticeBase & { game: P121Game; onGiveUp: () => void } = $props()

  const cp = $derived(game.currentPlayer)
  const cur = $derived(game.seats[cp])
  const playing = $derived(game.phase === 'game')
  let confirmGiveUp = $state(false)
  // Checked out: the visit waits for takeout, which starts the next try
  const made = $derived(playing && cur.left === 0)
  const lastTry = $derived(cur.tries.length + 1 >= game.cfg.tries)
  const solo = $derived(players.length === 1)
  // Solo has no next player: the button names the next visit, or the next try once checked out
  const nextLabel = $derived(
    !solo ? next.label : made ? (lastTry ? 'Finish' : `Next: ${cur.target + 1}`) : next.label === 'Next player' ? 'Next visit' : next.label,
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
  {canThrow}
  {locked}
  outMode={game.cfg.outMode}
  {nextLabel}
  phoneLadderLabel="Target ladder · {cur.made} of {cur.tries.length} made"
>
  {#snippet card(seat: number, variant: 'solo' | 'side' | 'phone', active: boolean, visitDarts: number, portrait: boolean)}
    <P121PlayerCard {game} {seat} who={who[seat]} {active} {visitDarts} {variant} {portrait} {checkout} />
  {/snippet}
  {#snippet ladder(seat: number, visitDarts: number)}<P121Ladder {game} {seat} {visitDarts} variant="dots" />{/snippet}
  {#snippet panel()}<P121SessionPanel {game} seat={0} visitDarts={playing ? darts.length : 0} />{/snippet}
  {#snippet madeBody()}
    <span class="flex-1 min-w-0 flex flex-col gap-1">
      <span class="type-checkout font-bold leading-none text-accent">Checked out</span>
      <span class="text-body text-text"
        >{cur.target} · {darts.map(d => d.segment.name).join(', ')} in {plural(cur.darts + darts.length, 'dart')}</span
      >
      {#if !lastTry}<span class="text-label text-text-muted"
          >Next target <strong class="text-text">{cur.target + 1}</strong> · try {cur.tries.length + 2} of {game.cfg.tries}</span
        >{/if}
    </span>
    <!-- Solo only: in multiplayer the next dart is the next player's -->
    {#if solo && !lastTry}<span class="shrink-0 max-w-[180px] text-right text-caption text-text-dim"
        >Take your darts out to start the next try</span
      >{/if}
  {/snippet}
  {#snippet giveUp()}
    {#if canThrow && playing && !locked}
      <!-- Darts in the board: their takeout would end a visit of a try that's already over -->
      <span class="shrink-0 flex flex-col items-end">
        <button
          type="button"
          class="h-11 px-2 border-0 text-text-muted text-[15px] cursor-pointer hover:text-text disabled:cursor-default disabled:text-text-dim disabled:hover:text-text-dim"
          disabled={darts.length > 0}
          aria-describedby={darts.length > 0 ? 'p121-give-up-hint' : undefined}
          onclick={() => (confirmGiveUp = true)}>Give up this try ›</button
        >
        {#if darts.length > 0}<span id="p121-give-up-hint" class="px-2 text-[12px] text-text-dim">Take your darts out first</span>{/if}
      </span>
    {/if}
  {/snippet}
</PracticeMatch>

{#if confirmGiveUp}
  <ConfirmModal
    title="Give up this try?"
    body="It counts as missed."
    confirmLabel="Give up"
    cancelLabel="Keep playing"
    danger
    onconfirm={() => {
      confirmGiveUp = false
      onGiveUp()
    }}
    oncancel={() => (confirmGiveUp = false)}
  />
{/if}
