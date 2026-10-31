<!--
  The 121 Checkout match screen (P121-Game, -Made, -Missed, -Phone). Solo: the player card, the
  board with This visit, the route slots and the controls, then the session panel. Two players: a
  card with the dot ladder either side of the board. Three or more: the board, then stacked rows.
  Phones: the compact card, the slots, the board and the dot ladder.
-->
<script lang="ts">
  import type { Who } from '$lib/face'
  import type { Segment } from '$lib/api'
  import type { P121Game } from '$lib/api/game-ws'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import MatchFrame from '$lib/components/match/MatchFrame.svelte'
  import DartSlots from '$lib/components/DartSlots.svelte'
  import RowShell from '$lib/components/RowShell.svelte'
  import P121Ladder from '$lib/components/p121/P121Ladder.svelte'
  import P121PlayerCard from '$lib/components/p121/P121PlayerCard.svelte'
  import P121SessionPanel from '$lib/components/p121/P121SessionPanel.svelte'
  import { boardCheckoutTargets, x01Slots } from '$lib/dartSlots'
  import { plural } from '$lib/fmt'
  import type { GameSettings } from '$lib/gameSettings'
  import type { MatchLayout } from '$lib/matchLayout'
  import type { CheckoutPrefs } from '$shared/checkout.js'

  let {
    game,
    players,
    who,
    darts,
    layout,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    onCorrect,
    onGiveUp,
    settings,
    checkout,
    keypad = false,
    onDart = () => {},
    viewOnly = false,
  }: {
    game: P121Game
    players: { name: string }[]
    /** Per seat: its name, bot and picture. */
    who: Who[]
    /** The open visit's darts, drawn where they landed. */
    darts: { segment: Segment; score: number; coords?: { x: number; y: number } }[]
    layout: MatchLayout
    canThrow: boolean
    locked: boolean
    canUndo: boolean
    next: { label: string; prominent: boolean; enabled: boolean }
    onUndo: () => void
    onNext: () => void
    onBoardClick: (hit: { segment: Segment; coords: { x: number; y: number } }) => void
    onCorrect?: (dartIndex: number, label: string) => void
    onGiveUp: () => void
    settings: GameSettings
    checkout?: CheckoutPrefs
    /** The header's Enter view: the keypad takes the board's place. */
    keypad?: boolean
    onDart?: (segment: Segment) => void
    /** The big screen: no Undo, Next or Give up, nothing to tap. */
    viewOnly?: boolean
  } = $props()

  const cp = $derived(game.currentPlayer)
  const cur = $derived(game.seats[cp])
  const playing = $derived(game.phase === 'game')
  const slots = $derived(
    x01Slots({
      darts,
      remaining: cur.left,
      outMode: game.cfg.outMode,
      opened: true,
      bust: game.bust,
      suggest: settings.checkoutSuggestions,
      checkout,
      finishFoot: 'checks out',
    }),
  )
  let openDart = $state<number | null>(null)
  let confirmGiveUp = $state(false)
  const visitSum = $derived(game.visitStartLeft - cur.left)
  // Checked out: the visit waits for takeout, which starts the next try
  const made = $derived(playing && cur.left === 0)
  const lastTry = $derived(cur.tries.length + 1 >= game.cfg.tries)
  const name = (i: number) => players[i]?.name ?? ''
  const vd = (i: number) => (i === cp && playing ? darts.length : 0)
  const solo = $derived(players.length === 1)
  // Solo has no next player: the button names the next visit, or the next try once checked out
  const nextLabel = $derived(
    !solo ? next.label : made ? (lastTry ? 'Finish' : `Next: ${cur.target + 1}`) : next.label === 'Next player' ? 'Next visit' : next.label,
  )
</script>

{#snippet board()}
  <BoardOrKeypad
    {keypad}
    {darts}
    {canThrow}
    {locked}
    {canUndo}
    next={{ ...next, label: nextLabel }}
    {onUndo}
    {onNext}
    {onBoardClick}
    {onDart}
    {onCorrect}
    bind:openDart
    board={{ checkoutTargets: playing ? boardCheckoutTargets(slots, true) : [] }}
    keypadClass="min-h-[220px]"
  />
{/snippet}

{#snippet giveUp()}
  {#if canThrow && playing && !locked}
    <!-- Darts in the board: their takeout would end a visit of a try that's already over -->
    <span class="shrink-0 flex flex-col items-end">
      <button
        type="button"
        class="h-11 px-2 border-0 bg-transparent text-text-muted text-[15px] cursor-pointer hover:text-text disabled:cursor-default disabled:text-text-dim disabled:hover:text-text-dim"
        disabled={darts.length > 0}
        aria-describedby={darts.length > 0 ? 'p121-give-up-hint' : undefined}
        onclick={() => (confirmGiveUp = true)}>Give up this try ›</button
      >
      {#if darts.length > 0}<span id="p121-give-up-hint" class="px-2 text-[12px] text-text-dim">Take your darts out first</span>{/if}
    </span>
  {/if}
{/snippet}

{#snippet controls(compact: boolean)}
  {#if !viewOnly}
    <div class="flex items-center gap-3">
      <div class="flex-1 min-w-0">
        {#if !keypad}
          <ControlBar
            {compact}
            {canUndo}
            label={nextLabel}
            prominent={next.prominent}
            primary={made}
            enabled={next.enabled}
            {onUndo}
            {onNext}
          />
        {/if}
      </div>
      <!-- Phones: no room beside Undo and Next; it sits by the ladder instead -->
      {#if layout !== 'phone'}{@render giveUp()}{/if}
    </div>
  {/if}
{/snippet}

{#snippet madeCard()}
  {#if made}
    <div role="status" class="rounded-[18px] border-2 border-accent bg-surface-picked px-6 py-4 flex items-center gap-5">
      <span class="flex-1 min-w-0 flex flex-col gap-1">
        <span class="font-display font-bold text-[40px] leading-none text-accent">Checked out</span>
        <span class="text-[15px] text-text"
          >{cur.target} · {darts.map(d => d.segment.name).join(', ')} in {plural(cur.darts + darts.length, 'dart')}</span
        >
        {#if !lastTry}<span class="text-[14px] text-text-muted"
            >Next target <strong class="text-text">{cur.target + 1}</strong> · try {cur.tries.length + 2} of {game.cfg.tries}</span
          >{/if}
      </span>
      <!-- Solo only: in multiplayer the next dart is the next player's -->
      {#if solo && !lastTry}<span class="shrink-0 max-w-[180px] text-right text-[12px] text-text-dim"
          >Take your darts out to start the next try</span
        >{/if}
    </div>
  {/if}
{/snippet}

{#snippet center(compact: boolean)}
  {@render board()}
  <div class="h-[96px] shrink-0 box-border rounded-[14px] border border-line bg-surface-1 px-6 flex items-center justify-between">
    <span class="text-[13px] font-semibold label-caps text-text-dim">This visit</span>
    <span class="font-display font-bold text-[84px] leading-none">{visitSum}</span>
    <span class="w-[70px]"></span>
  </div>
  <DartSlots {slots} {onCorrect} bind:openDart />
  {@render controls(compact)}
  {@render madeCard()}
{/snippet}

{#snippet phoneLayout()}
  <P121PlayerCard {game} seat={cp} who={who[cp]} active visitDarts={vd(cp)} variant="phone" {checkout} />
  <div class="relative shrink-0"><DartSlots {slots} {onCorrect} bind:openDart showPopover={!keypad} popoverAbove /></div>
  {@render board()}
  {@render madeCard()}
  <section class="shrink-0 flex flex-col gap-2" aria-label="Target ladder">
    <div class="flex items-center justify-between gap-2">
      <span class="text-[12px] font-semibold label-caps text-text-dim">Target ladder · {cur.made} of {cur.tries.length} made</span>
      {@render giveUp()}
    </div>
    <P121Ladder {game} seat={cp} variant="dots" />
  </section>
  {@render controls(true)}
{/snippet}

{#snippet portraitLayout()}
  {#if game.seats.length <= 2}
    <div class="shrink-0 grid gap-3 lg:gap-4 {game.seats.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}">
      {#each game.seats as _, i (i)}
        <div class="min-w-0 flex flex-col gap-3">
          <P121PlayerCard {game} seat={i} who={who[i]} active={i === cp && playing} visitDarts={vd(i)} variant="side" portrait {checkout} />
          <P121Ladder {game} seat={i} variant="dots" />
        </div>
      {/each}
    </div>
  {:else}
    <div class="shrink-0 max-h-[40%] overflow-y-auto flex flex-col gap-3">{@render rows()}</div>
  {/if}
  <div class="shrink-0 grid grid-cols-[minmax(0,1.15fr)_minmax(0,3fr)] gap-[10px] items-start">
    <div
      class="h-[58px] md:h-[min(124px,14vh)] box-border rounded-[14px] border border-line bg-surface-1 px-5 flex items-center justify-between"
    >
      <span class="text-[13px] font-semibold label-caps text-text-dim">This visit</span>
      <span class="font-display font-bold text-[min(84px,8vh)] leading-none">{visitSum}</span>
    </div>
    <DartSlots {slots} {onCorrect} bind:openDart />
  </div>
  {@render controls(false)}
  {@render madeCard()}
  {@render board()}
{/snippet}

{#snippet soloLayout()}
  <P121PlayerCard {game} seat={0} who={who[0]} active visitDarts={vd(0)} {checkout} />
  <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-[14px]">{@render center(false)}</div>
  <P121SessionPanel {game} seat={0} visitDarts={vd(0)} />
{/snippet}

{#snippet duelLayout()}
  {#each [0, 1] as i (i)}
    <div class="w-[300px] xl:w-[380px] shrink-0 min-h-0 flex flex-col gap-3 {i === 1 ? 'order-3' : ''}">
      <P121PlayerCard {game} seat={i} who={who[i]} active={i === cp && playing} visitDarts={vd(i)} variant="side" {checkout} />
      <P121Ladder {game} seat={i} variant="dots" />
    </div>
  {/each}
  <div class="order-2 flex-1 min-w-0 min-h-0 flex flex-col gap-3">{@render center(false)}</div>
{/snippet}

{#snippet partyLayout()}
  <div class="w-[400px] xl:w-[480px] shrink-0 min-h-0 flex flex-col gap-3">{@render center(true)}</div>
  <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-3 overflow-y-auto">{@render rows()}</div>
{/snippet}

<MatchFrame {layout} phone={phoneLayout} portrait={portraitLayout} solo={soloLayout} duel={duelLayout} party={partyLayout} />
{#snippet rows()}
  {#each game.seats as s, i (i)}
    <!-- As tall as its content: the list scrolls rather than stretching the rows -->
    <div class="shrink-0">
      <RowShell
        who={who[i]}
        active={i === cp && playing}
        pill={s.done ? 'out' : null}
        pillLabel="Done"
        label="{name(i)}, target {s.target}, {s.left} left"
        class="py-4 grid-cols-[minmax(0,1fr)_auto_110px]"
      >
        <span class="flex items-baseline gap-[6px]">
          <span class="text-[12px] label-caps text-text-dim">Target</span>
          <span class="font-display font-bold text-[28px] text-accent">{s.target}</span>
        </span>
        <span class="flex items-baseline gap-[6px] justify-end">
          <span class="text-[12px] label-caps text-text-dim">Left</span>
          <span class="font-display font-bold text-[44px] leading-none">{s.left}</span>
        </span>
        <div class="col-span-full"><P121Ladder {game} seat={i} variant="dots" visitDarts={vd(i)} /></div>
      </RowShell>
    </div>
  {/each}
{/snippet}

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
