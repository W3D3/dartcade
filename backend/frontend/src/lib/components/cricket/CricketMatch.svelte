<!--
  The Cricket match screen; the marks table is its hero. Two sides (Cricket-Duel): a left column
  with the thrower's card, the other side's card and the board; the table fills the right, the
  dart slots and controls under it (Cricket drops the board-centred duel rule). Three or more
  (Cricket-Party): the table with a column per player, the board, slots and controls beside it.
  Phones (Mobile-Cricket): a strip of cards, the table, the board, the slots and the controls.
  Portrait screens keep the duel or party layout.
-->
<script lang="ts">
  import type { Who } from '$lib/face'
  import type { Segment } from '$lib/api'
  import type { CricketGame } from '$lib/api/game-ws'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import MatchFrame from '$lib/components/match/MatchFrame.svelte'
  import DartSlots from '$lib/components/DartSlots.svelte'
  import CricketPanel from '$lib/components/cricket/CricketPanel.svelte'
  import MarksGrid from '$lib/components/cricket/MarksGrid.svelte'
  import { markDeltas } from '$lib/cricket/animate'
  import { cricketSides, targetState, type CricketSide } from '$lib/cricket/view'
  import { cricketSlots } from '$lib/dartSlots'
  import type { MatchLayout } from '$lib/matchLayout'
  import { isNarrowMatch } from '$lib/viewport'

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
    keypad = false,
    onDart = () => {},
  }: {
    game: CricketGame
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
    onCorrect: (dartIndex: number, label: string) => void
    /** The header's Enter view: the keypad takes the board's place. */
    keypad?: boolean
    onDart?: (segment: Segment) => void
  } = $props()

  const cp = $derived(game.currentPlayer)
  const sides = $derived(cricketSides(game, players))
  // A team has no single picture: its panel shows initials
  const faceOf = (s: { seat: number; members: string | null }) => (s.members === null ? who[s.seat].face : null)
  // `layout` only tracks teams for X01 (see matchView), so a cricket 2v2 arrives as 'party';
  // go by the side count and the narrow breakpoint directly instead.
  const variant = $derived(layout === 'phone' ? 'phone' : sides.length === 2 && !$isNarrowMatch ? 'duel' : 'party')
  const isUp = (s: CricketSide) => s.seats.includes(cp)
  const upNext = (s: CricketSide) => !isUp(s) && s.seats.includes(game.nextPlayer ?? -1)
  const thrower = $derived(sides.find(isUp) ?? sides[0])
  // Only the strokes the last dart added draw in (see markDeltas)
  let prev: CricketGame | null = null
  const from = $derived.by(() => {
    const f = markDeltas(prev, game)
    prev = game
    return f
  })
  const inPlay = $derived({
    score: game.targets.filter((_, i) => targetState(game, cp, i) === 'score'),
    open: game.targets.filter((_, i) => targetState(game, cp, i) === 'need'),
  })
  const slots = $derived(cricketSlots({ darts, targets: game.targets, locked: game.visitLocked }))
  let openDart = $state<number | null>(null)
  // Short screens (iPad landscape, 720p) and the keypad: compact duel cards leave the board or
  // keypad enough height in the left column
  let innerHeight = $state(0)
  const compact = $derived(keypad || (innerHeight > 0 && innerHeight < 800))
</script>

{#snippet board(legend: boolean)}
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
    bind:openDart
    board={{ inPlay }}
    class="min-h-[120px] min-w-0"
    keypadClass="min-w-0 {variant === 'duel' ? 'min-h-[300px]' : 'min-h-0'}"
  />
  {#if legend && !keypad}
    <div class="shrink-0 flex flex-wrap justify-center gap-x-4 gap-y-[6px] text-[13px] text-text-muted">
      <span class="inline-flex items-center gap-[7px] min-w-0"
        ><span class="w-3 h-3 shrink-0 rounded-[3px] bg-accent"></span><span class="truncate">{thrower.name} can score</span></span
      >
      <span class="inline-flex items-center gap-[7px]"
        ><span class="w-3 h-3 shrink-0 box-border rounded-[3px] bg-bg-deep border-[1.5px] border-line-pip"></span>Closed or not in play</span
      >
    </div>
  {/if}
{/snippet}

{#snippet controls(compact: boolean)}
  {#if !keypad}
    <ControlBar {compact} {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} {onUndo} {onNext} />
  {/if}
{/snippet}

{#snippet table(cls: string)}
  <section aria-label="Marks" class="box-border bg-surface-panel border border-line-2 {cls}">
    <MarksGrid {game} {sides} {from} {variant} />
  </section>
{/snippet}

<svelte:window bind:innerHeight />

{#snippet phoneLayout()}
  <div class="shrink-0 grid grid-cols-2 gap-2">
    {#each sides as s (s.seat)}<CricketPanel {game} side={s} face={faceOf(s)} active={isUp(s)} upNext={upNext(s)} size="sm" />{/each}
  </div>
  {@render table('shrink-0 rounded-[14px] px-2 pt-[10px] pb-1')}
  {@render board(false)}
  <div class="relative shrink-0"><DartSlots {slots} {onCorrect} bind:openDart showPopover={!keypad} popoverAbove /></div>
  {@render controls(true)}
{/snippet}

{#snippet duelLayout()}
  {@const other = sides.find(s => s !== thrower) ?? sides[1]}
  <div class="w-[300px] xl:w-[392px] shrink-0 min-h-0 overflow-y-auto flex flex-col {compact ? 'gap-3' : 'gap-4'}">
    <CricketPanel {game} side={thrower} face={faceOf(thrower)} active={isUp(thrower)} upNext={upNext(thrower)} size="lg" {compact} />
    <CricketPanel {game} side={other} face={faceOf(other)} active={false} upNext={upNext(other)} size="md" {compact} />
    {@render board(true)}
  </div>
  <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-4">
    {@render table('flex-1 min-h-0 overflow-y-auto rounded-[18px] px-5 pt-4 pb-2')}
    <DartSlots {slots} {onCorrect} bind:openDart />
    {@render controls(false)}
  </div>
{/snippet}

{#snippet partyLayout()}
  {@render table('flex-1 min-w-0 min-h-0 overflow-auto rounded-[18px] px-3 xl:px-5 pt-4 pb-2')}
  <aside aria-label="Board" class="w-[280px] xl:w-[420px] shrink-0 min-h-0 flex flex-col gap-3">
    {@render board(true)}
    <DartSlots {slots} {onCorrect} bind:openDart />
    {@render controls(false)}
  </aside>
{/snippet}

{#snippet portraitLayout()}
  <div class="flex-1 min-h-0 flex gap-6">
    {#if variant === 'duel'}{@render duelLayout()}{:else}{@render partyLayout()}{/if}
  </div>
{/snippet}

<MatchFrame
  layout={layout === 'portrait' ? 'portrait' : variant}
  phone={phoneLayout}
  portrait={portraitLayout}
  duel={duelLayout}
  party={partyLayout}
/>
