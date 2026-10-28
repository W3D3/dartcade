<!--
  The match screen's throwing surface: the dartboard in the largest square the column has room for
  (clicked to add a dart), or with the header's Enter view the keypad in its place. A dart selected in
  the slots is replaced by the next key (or a board click is a new dart, as before). Every game's
  match screen uses this; `board` passes what a game draws on its board (targets, markers, camera).
-->
<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte'
  import type { Segment } from '$lib/api'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import DartKeypad from '$lib/components/DartKeypad.svelte'

  type Hit = { segment: Segment; coords: { x: number; y: number } }

  let {
    keypad = false,
    darts,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    onDart,
    onCorrect,
    openDart = $bindable(null),
    board = {},
    over,
    class: className = 'min-h-[160px]',
    square = '',
    keypadClass = 'min-h-0',
  }: {
    keypad?: boolean
    /** The open visit's darts, drawn where they landed. */
    darts: { segment: Segment; score: number; coords?: { x: number; y: number } }[]
    canThrow: boolean
    locked: boolean
    canUndo: boolean
    next: { label: string; prominent: boolean; enabled: boolean }
    onUndo: () => void
    onNext: () => void
    onBoardClick: (hit: Hit) => void
    /** A key with no dart selected: a new dart. */
    onDart: (segment: Segment) => void
    /** A key with a dart selected: that dart becomes the key's segment. */
    onCorrect?: (dartIndex: number, label: string) => void
    /** The dart selected in the slots (0-based), shared with DartSlots. */
    openDart?: number | null
    /** What the game draws on the board besides the darts. */
    board?: Omit<ComponentProps<typeof DartBoard>, 'darts' | 'onBoardClick' | 'selectedDart'>
    /** Over the board, in its square (the board view toggle). */
    over?: Snippet
    /** The board's column: its minimum height. */
    class?: string
    /** The board's square: a width cap. */
    square?: string
    /** The keypad's column. */
    keypadClass?: string
  } = $props()

  function keyDart(segment: Segment): void {
    if (openDart === null) {
      onDart(segment)
      return
    }
    onCorrect?.(openDart, segment.name)
    openDart = null
  }
</script>

{#if keypad}
  <div class="flex-1 {keypadClass}">
    <DartKeypad
      onDart={keyDart}
      replacing={openDart}
      dartCount={darts.length}
      {locked}
      disabled={!canThrow}
      {canUndo}
      {onUndo}
      nextLabel={next.label}
      nextEnabled={next.enabled}
      nextProminent={next.prominent}
      {onNext}
    />
  </div>
{:else}
  <!-- The board takes the height the column has left (capped by its width) -->
  <div class="flex-1 {className} w-full [container-type:size] flex items-center justify-center">
    <div class="relative aspect-square {square}" style="width: min(100cqw, 100cqh)">
      <DartBoard {darts} {...board} onBoardClick={canThrow && !locked ? onBoardClick : undefined} selectedDart={openDart} />
      {@render over?.()}
    </div>
  </div>
{/if}
