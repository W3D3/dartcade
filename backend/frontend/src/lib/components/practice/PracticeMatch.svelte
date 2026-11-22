<!--
  The match screen of the checkout practice modes (121 Checkout, Catch 40): one open target, a dart
  budget, a ladder and a session panel. Solo: the player card, the board with This visit, the route
  slots and the controls, then the session panel. Two players: a card with the dot ladder either
  side of the board. Three or more: the board, then stacked rows. Phones: the compact card, the
  slots, the board and the dot ladder. Each mode passes its own card, ladder, panel and checked-out
  strip as snippets, and the button label (the modes differ on what comes next).
-->
<script lang="ts">
  import type { PracticeBase, PracticeGame } from './types'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import TurnStatusBar from '$lib/components/TurnStatusBar.svelte'
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import MatchFrame from '$lib/components/match/MatchFrame.svelte'
  import DartSlots from '$lib/components/DartSlots.svelte'
  import RowShell from '$lib/components/RowShell.svelte'
  import SectionLabel from '$lib/components/SectionLabel.svelte'
  import { boardCheckoutTargets, x01Slots } from '$lib/dartSlots'
  import type { Snippet } from 'svelte'

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
    onDartMove,
    settings,
    outMode,
    nextLabel,
    card,
    ladder,
    panel,
    madeBody,
    giveUp,
    phoneLadderLabel,
    checkout,
    keypad = false,
    onDart = () => {},
    viewOnly = false,
    turn = null,
  }: PracticeBase & {
    game: PracticeGame
    outMode: 'straight' | 'double' | 'master'
    /** The Next button's label: what comes next differs per mode. */
    nextLabel: string
    /** A seat's player card; `side` and `phone` are the duel and phone cards. */
    card: Snippet<[seat: number, variant: 'solo' | 'side' | 'phone', active: boolean, visitDarts: number, portrait: boolean]>
    /** A seat's dot ladder. */
    ladder: Snippet<[seat: number, visitDarts: number]>
    /** The solo session panel. */
    panel: Snippet
    /** What the checked-out strip says. */
    madeBody: Snippet
    /** Give up, where the mode has it (121). */
    giveUp?: Snippet
    /** The label over the phone's ladder. */
    phoneLadderLabel: string
  } = $props()

  const cp = $derived(game.currentPlayer)
  const cur = $derived(game.seats[cp])
  const playing = $derived(game.phase === 'game')
  const slots = $derived(
    x01Slots({
      darts,
      remaining: cur.left,
      outMode,
      opened: true,
      bust: game.bust,
      suggest: settings.checkoutSuggestions,
      checkout,
      finishFoot: 'checks out',
    }),
  )
  let openDart = $state<number | null>(null)
  const visitSum = $derived(game.visitStartLeft - cur.left)
  // Checked out: the visit waits for takeout, which starts the next target
  const made = $derived(playing && cur.left === 0)
  const name = (i: number) => players[i]?.name ?? ''
  const vd = (i: number) => (i === cp && playing ? darts.length : 0)
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
    {onDartMove}
    bind:openDart
    board={{ checkoutTargets: playing ? boardCheckoutTargets(slots, true) : [] }}
  />
{/snippet}

{#snippet controls(compact: boolean)}
  {#if !viewOnly}
    <div class="flex items-center gap-3">
      <div class="flex-1 min-w-0">
        {#if turn}
          <TurnStatusBar status={turn} {compact} />
        {:else if !keypad}
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
      {#if layout !== 'phone' && giveUp}{@render giveUp()}{/if}
    </div>
  {/if}
{/snippet}

{#snippet madeCard()}
  {#if made}
    <div role="status" class="rounded-panel border-2 border-accent bg-surface-picked px-6 py-4 flex items-center gap-5">
      {@render madeBody()}
    </div>
  {/if}
{/snippet}

{#snippet center(compact: boolean)}
  {@render board()}
  <div class="h-[96px] shrink-0 box-border rounded-card border border-line bg-surface-1 px-6 flex items-center justify-between">
    <span class="text-[13px] font-semibold label-caps text-text-dim">This visit</span>
    <span class="font-display font-bold text-[84px] leading-none">{visitSum}</span>
    <span class="w-[70px]"></span>
  </div>
  <DartSlots {slots} {onCorrect} bind:openDart />
  {@render controls(compact)}
  {@render madeCard()}
{/snippet}

{#snippet phoneLayout()}
  {@render card(cp, 'phone', true, vd(cp), false)}
  <div class="relative shrink-0"><DartSlots {slots} {onCorrect} bind:openDart showPopover={!keypad} popoverAbove /></div>
  {@render board()}
  {@render madeCard()}
  <section class="shrink-0 flex flex-col gap-2" aria-label="Target ladder">
    <div class="flex items-center justify-between gap-2">
      <SectionLabel>{phoneLadderLabel}</SectionLabel>
      {#if giveUp}{@render giveUp()}{/if}
    </div>
    {@render ladder(cp, vd(cp))}
  </section>
  {@render controls(true)}
{/snippet}

{#snippet portraitLayout()}
  {#if game.seats.length <= 2}
    <div class="shrink-0 grid gap-3 lg:gap-4 {game.seats.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}">
      {#each game.seats as _, i (i)}
        <div class="min-w-0 flex flex-col gap-3">
          {@render card(i, 'side', i === cp && playing, vd(i), true)}
          {@render ladder(i, vd(i))}
        </div>
      {/each}
    </div>
  {:else}
    <div class="shrink-0 max-h-[40%] overflow-y-auto flex flex-col gap-3">{@render rows()}</div>
  {/if}
  <div class="shrink-0 grid grid-cols-[minmax(0,1.15fr)_minmax(0,3fr)] gap-[10px] items-start">
    <div
      class="h-[58px] md:h-[min(124px,14vh)] box-border rounded-card border border-line bg-surface-1 px-5 flex items-center justify-between"
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
  {@render card(0, 'solo', true, vd(0), false)}
  <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-[14px]">{@render center(false)}</div>
  {@render panel()}
{/snippet}

{#snippet duelLayout()}
  {#each [0, 1] as i (i)}
    <div class="w-[300px] xl:w-[380px] shrink-0 min-h-0 flex flex-col gap-3 {i === 1 ? 'order-3' : ''}">
      {@render card(i, 'side', i === cp && playing, vd(i), false)}
      {@render ladder(i, vd(i))}
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
        <div class="col-span-full">{@render ladder(i, vd(i))}</div>
      </RowShell>
    </div>
  {/each}
{/snippet}
