<!--
  The 121 Checkout match screen (P121-Game, -Made, -Missed, -Phone). Solo: the player card, the
  board with This visit, the route slots and the controls, then the session panel. Two players: a
  card with the dot ladder either side of the board. Three or more: the board, then stacked rows.
  Phones: the compact card, the slots, the board and the dot ladder.
-->
<script lang="ts">
  import type { Segment } from '$lib/api'
  import type { P121Game } from '$lib/api/game-ws'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import DartKeypad from '$lib/components/DartKeypad.svelte'
  import DartSlots from '$lib/components/DartSlots.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import P121Ladder from '$lib/components/p121/P121Ladder.svelte'
  import P121PlayerCard from '$lib/components/p121/P121PlayerCard.svelte'
  import P121SessionPanel from '$lib/components/p121/P121SessionPanel.svelte'
  import { boardCheckoutTargets, x01Slots } from '$lib/dartSlots'
  import { plural } from '$lib/fmt'
  import type { GameSettings } from '$lib/gameSettings'
  import type { MatchLayout } from '$lib/matchLayout'
  import { playerCard } from '$lib/playerCard'
  import type { CheckoutPrefs } from '$shared/checkout.js'

  let {
    game,
    players,
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
  }: {
    game: P121Game
    players: { name: string }[]
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
    onCorrect: (dartIndex: number, label: string) => void
    onGiveUp: () => void
    settings: GameSettings
    checkout?: CheckoutPrefs
    /** The header's Enter view: the keypad takes the board's place. */
    keypad?: boolean
    onDart?: (segment: Segment) => void
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
  // With a thrown dart selected, a key replaces it (as on GameDisplay's phone keypad)
  function keyDart(segment: Segment): void {
    if (openDart === null) {
      onDart(segment)
      return
    }
    onCorrect(openDart, segment.name)
    openDart = null
  }
</script>

{#snippet board()}
  {#if keypad}
    <div class="flex-1 min-h-[220px]">
      <DartKeypad
        onDart={keyDart}
        replacing={openDart}
        dartCount={darts.length}
        {locked}
        disabled={!canThrow}
        {canUndo}
        {onUndo}
        {nextLabel}
        nextEnabled={next.enabled}
        nextProminent={next.prominent}
        {onNext}
      />
    </div>
  {:else}
    <div class="flex-1 min-h-[160px] w-full [container-type:size] flex items-center justify-center">
      <div class="relative aspect-square" style="width: min(100cqw, 100cqh)">
        <DartBoard
          {darts}
          checkoutTargets={playing ? boardCheckoutTargets(slots, true) : []}
          onBoardClick={canThrow && !locked ? onBoardClick : undefined}
          selectedDart={openDart}
        />
      </div>
    </div>
  {/if}
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

{#if layout === 'phone'}
  <main class="flex-grow min-h-0 overflow-y-auto box-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] flex flex-col gap-2">
    <P121PlayerCard {game} seat={cp} name={name(cp)} active visitDarts={vd(cp)} variant="phone" {checkout} />
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
  </main>
{:else if layout === 'solo'}
  <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
    <P121PlayerCard {game} seat={0} name={name(0)} active visitDarts={vd(0)} {checkout} />
    <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-[14px]">{@render center(false)}</div>
    <P121SessionPanel {game} seat={0} visitDarts={vd(0)} />
  </main>
{:else if layout === 'duel'}
  <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
    {#each [0, 1] as i (i)}
      <div class="w-[300px] xl:w-[380px] shrink-0 min-h-0 flex flex-col gap-3 {i === 1 ? 'order-3' : ''}">
        <P121PlayerCard {game} seat={i} name={name(i)} active={i === cp && playing} visitDarts={vd(i)} variant="side" {checkout} />
        <P121Ladder {game} seat={i} variant="dots" />
      </div>
    {/each}
    <div class="order-2 flex-1 min-w-0 min-h-0 flex flex-col gap-3">{@render center(false)}</div>
  </main>
{:else}
  <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
    <div class="w-[400px] xl:w-[480px] shrink-0 min-h-0 flex flex-col gap-3">{@render center(true)}</div>
    <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-3 overflow-y-auto">
      {#each game.seats as s, i (i)}
        <section
          aria-label="{name(i)}, target {s.target}, {s.left} left"
          class="rounded-[14px] box-border px-5 py-4 flex flex-col gap-3 {playerCard(i === cp && playing)}"
        >
          <div class="flex items-center gap-4 min-w-0">
            <Avatar name={name(i)} tone={i === cp && playing ? 'accent' : 'default'} size={36} />
            <span class="text-[19px] font-semibold truncate">{name(i)}</span>
            {#if s.done}<span class="rounded-full bg-surface-chip px-2 py-[2px] text-[12px] label-caps text-text-muted">done</span>{/if}
            <span class="ml-auto flex items-baseline gap-[6px]">
              <span class="text-[12px] label-caps text-text-dim">Target</span>
              <span class="font-display font-bold text-[28px] text-accent">{s.target}</span>
            </span>
            <span class="flex items-baseline gap-[6px] w-[110px] justify-end">
              <span class="text-[12px] label-caps text-text-dim">Left</span>
              <span class="font-display font-bold text-[44px] leading-none">{s.left}</span>
            </span>
          </div>
          <P121Ladder {game} seat={i} variant="dots" visitDarts={vd(i)} />
        </section>
      {/each}
    </div>
  </main>
{/if}

{#if confirmGiveUp}
  <ConfirmModal
    title="Give up this try?"
    body="It counts as missed."
    confirmLabel="Give up"
    danger
    onconfirm={() => {
      confirmGiveUp = false
      onGiveUp()
    }}
    oncancel={() => (confirmGiveUp = false)}
  />
{/if}
