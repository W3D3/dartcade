<script lang="ts">
  // The visit being thrown in a room that takes darts (a fight, a rest): the board or the keypad, the
  // three dart slots (tap one to correct it; the board highlights it), then Undo and Next, or whose
  // turn it is when the viewer isn't up. `damage` replaces each slot's score once the visit resolved.
  // The board is as tall as the column is wide: these screens scroll, so the column has no height of its own.
  import type { Snippet } from 'svelte'
  import type { DungeonGame } from '$lib/api/game-ws'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import DartSlots from '$lib/components/DartSlots.svelte'
  import TurnStatusBar from '$lib/components/TurnStatusBar.svelte'
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import type { MatchControls } from '$lib/components/match/types'
  import { dungeonSlots } from '$lib/dartSlots'

  let {
    darts,
    damage = null,
    overlay,
    children,
    keypad = false,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    onDart = () => {},
    onCorrect,
    onDartMove,
    viewOnly = false,
    turn = null,
  }: MatchControls & {
    darts: DungeonGame['currentVisitDarts']
    damage?: readonly number[] | null
    /** Drawn on the board (Dungeon: the lit segments, the segment items). */
    overlay?: Snippet<[number]>
    /** Between the slots and the controls. */
    children?: Snippet
  } = $props()
  let openDart = $state<number | null>(null)
</script>

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
  bind:openDart
  board={{ overlay }}
  class="aspect-square"
/>
<div class="relative">
  <DartSlots slots={dungeonSlots({ darts, damage })} onCorrect={viewOnly ? undefined : onCorrect} bind:openDart showPopover={!keypad} />
</div>
{@render children?.()}
{#if !viewOnly}
  {#if turn}
    <TurnStatusBar status={turn} />
  {:else if !keypad}
    <ControlBar {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} {onUndo} {onNext} />
  {/if}
{/if}
