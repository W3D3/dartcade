<!--
  The Shanghai match screen. The board lights the round's number; under it the open visit shows the
  single, double and treble landed so far. Two players: a panel either side. Three or more: stacked
  rows beside the board. Portrait: the rows on top. Phones: the other players, the thrower's card,
  the board, the visit, the slots and the controls.
-->
<script lang="ts">
  import type { MatchControls } from '$lib/components/match/types'
  import type { Who } from '$lib/face'
  import type { Segment } from '$lib/api'
  import type { ShanghaiGame } from '$lib/api/game-ws'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import TurnStatusBar from '$lib/components/TurnStatusBar.svelte'
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import MatchFrame from '$lib/components/match/MatchFrame.svelte'
  import DartSlots from '$lib/components/DartSlots.svelte'
  import ShanghaiPlayer from '$lib/components/shanghai/ShanghaiPlayer.svelte'
  import ShanghaiVisit from '$lib/components/shanghai/ShanghaiVisit.svelte'
  import { shanghaiSlots } from '$lib/dartSlots'
  import { hitsTarget, kindLabel, missingKinds } from '$lib/shanghai/view'

  let {
    game,
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
    keypad = false,
    onDart = () => {},
    viewOnly = false,
    turn = null,
  }: {
    game: ShanghaiGame
    /** Per seat: its name, bot and picture. */
    who: Who[]
    /** The open visit's darts, drawn where they landed. */
    darts: { segment: Segment; score: number; coords?: { x: number; y: number } }[]
  } & MatchControls = $props()

  const cp = $derived(game.currentPlayer)
  const playing = $derived(game.phase === 'game')
  const slots = $derived(
    shanghaiSlots({
      darts,
      hits: darts.map(d => hitsTarget(d, game.target)),
      target: game.target,
      suggest: game.cfg.shanghaiWins ? missingKinds(game).map(k => kindLabel(k, game.target)) : [],
    }),
  )
  let openDart = $state<number | null>(null)
  const seatProps = (i: number) => ({ game, seat: i, who: who[i], active: i === cp && playing, upNext: i === game.nextPlayer && i !== cp })
</script>

{#snippet board()}
  <BoardOrKeypad
    {keypad}
    {darts}
    {canThrow}
    {locked}
    {canUndo}
    {next}
    {onUndo}
    {onNext}
    {onBoardClick}
    {onDart}
    {onCorrect}
    {onDartMove}
    board={{ target: game.target, dim: true }}
    bind:openDart
    class="min-h-[160px] min-w-0"
    keypadClass="min-w-0"
  />
{/snippet}

{#snippet controls(compact: boolean)}
  {#if !keypad && !viewOnly}
    {#if turn}
      <TurnStatusBar status={turn} {compact} />
    {:else}
      <ControlBar {compact} {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} {onUndo} {onNext} />
    {/if}
  {/if}
{/snippet}

{#snippet center()}
  {@render board()}
  <ShanghaiVisit {game} />
  <DartSlots {slots} {onCorrect} bind:openDart />
  {@render controls(false)}
{/snippet}

{#snippet phoneLayout()}
  <div class="shrink-0 max-h-[30%] overflow-y-auto flex flex-col gap-2">
    {#each game.seats as _, i (i)}
      {#if i !== cp || !playing}<ShanghaiPlayer {...seatProps(i)} variant="phone" />{/if}
    {/each}
  </div>
  {#if playing}<ShanghaiPlayer {...seatProps(cp)} variant="phone" />{/if}
  {@render board()}
  <ShanghaiVisit {game} />
  <div class="relative shrink-0"><DartSlots {slots} {onCorrect} bind:openDart showPopover={!keypad} popoverAbove /></div>
  {@render controls(true)}
{/snippet}

{#snippet portraitLayout()}
  <div class="shrink-0 max-h-[40%] overflow-y-auto flex flex-col gap-3">
    {#each game.seats as _, i (i)}<ShanghaiPlayer {...seatProps(i)} variant="row" />{/each}
  </div>
  <ShanghaiVisit {game} />
  <DartSlots {slots} {onCorrect} bind:openDart />
  {@render controls(false)}
  {@render board()}
{/snippet}

{#snippet duelLayout()}
  <ShanghaiPlayer {...seatProps(0)} variant="panel" />
  <div class="flex-[0_1_706px] min-w-0 min-h-0 flex flex-col gap-3">{@render center()}</div>
  <ShanghaiPlayer {...seatProps(1)} variant="panel" />
{/snippet}

{#snippet partyLayout()}
  <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-3 overflow-y-auto">
    {#each game.seats as _, i (i)}<ShanghaiPlayer {...seatProps(i)} variant="row" />{/each}
  </div>
  <aside aria-label="Board and visit" class="w-[400px] xl:w-[622px] shrink-0 min-h-0 flex flex-col gap-3">{@render center()}</aside>
{/snippet}

<MatchFrame {layout} phone={phoneLayout} portrait={portraitLayout} duel={duelLayout} party={partyLayout} />
