<script lang="ts">
  // The map phase (Dungeon-Pixel-Map, -Map-Phone): the map, the party and its artifacts, and the vote:
  // each hero throws one dart at the left or the right half of the board. Without a board, a tap on a
  // side enters a dart on that half.
  import { ChevronLeft, ChevronRight } from '@lucide/svelte'
  import type { DungeonGame } from '$lib/api/game-ws'
  import type { MatchControls } from '$lib/components/match/types'
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import { eventOutcomeLines, fresh } from '$lib/dungeon/battle'
  import { ROOMS, SIDE_DART, voteOf, type VoteSide } from '$lib/dungeon/view'
  import { isClassId } from '$shared/dungeon/content/classes'
  import ArtifactsPanel from './ArtifactsPanel.svelte'
  import DungeonMap from './DungeonMap.svelte'
  import PartyPanel from './PartyPanel.svelte'
  import PixelSprite from './PixelSprite.svelte'

  let {
    game,
    names,
    viewOnly,
    keypad,
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
  }: Omit<MatchControls, 'layout'> & { game: DungeonGame; names: string[] } = $props()

  const vote = $derived(voteOf(game))
  const canVote = $derived(!viewOnly && canThrow && !locked)
  const thrower = $derived(names[game.currentPlayer])
  // What the room just left gave: a fight's gold, an event's outcome
  const reward = $derived(fresh(game.lastReward, game))
  const event = $derived(fresh(game.lastEvent, game))
  const cleared = $derived(game.floor === 0 ? 'Act 1 · The way in' : `Act 1 · Floor ${game.floor} cleared`)
  const voteFor = (side: VoteSide['side']) =>
    onDart({ name: `S${SIDE_DART[side]}`, number: SIDE_DART[side], bed: 'SingleOuter', multiplier: 1 })
</script>

{#snippet sideCard(s: VoteSide, compact: boolean)}
  {@const Icon = ROOMS[s.room.type].icon}
  <button
    type="button"
    disabled={!canVote}
    data-side={s.side}
    class="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border-2 p-3 text-left {s.leading
      ? 'border-dg-gold bg-dg-gold/10'
      : 'border-dg-line bg-dg-panel'} {s.side === 'right' ? 'items-end text-right' : ''}"
    onclick={() => voteFor(s.side)}
  >
    <span class="flex items-center gap-1 font-display text-sm font-bold uppercase text-dg-gold">
      {#if s.side === 'left'}<ChevronLeft class="size-4" />Left{compact ? '' : ' half'}{:else}Right{compact ? '' : ' half'}<ChevronRight
          class="size-4"
        />{/if}
    </span>
    <span class="flex items-center gap-2 font-display text-2xl font-bold uppercase"><Icon class="size-6" />{ROOMS[s.room.type].label}</span>
    {#if !compact}<span class="text-sm text-dg-muted">{ROOMS[s.room.type].description}</span>{/if}
    <span class="mt-auto flex flex-col gap-1">
      {#if !compact && s.voters.length > 0}
        <span class="font-display text-xs font-bold uppercase text-dg-muted"
          >{s.leading ? 'Leading · ' : ''}{s.voters.length} {s.voters.length === 1 ? 'vote' : 'votes'}</span
        >
      {/if}
      <span class="flex flex-wrap gap-1">
        {#each s.voters as seat (seat)}
          {@const h = game.heroes[seat]}
          <span class="flex items-center gap-1 text-sm" title={names[seat]}>
            {#if h.classId && isClassId(h.classId)}<PixelSprite id={h.classId} scale={1.5} />{/if}{compact ? '' : names[seat]}
          </span>
        {/each}
      </span>
    </span>
  </button>
{/snippet}

{#snippet axis()}
  <line x1="0" y1="-1.15" x2="0" y2="1.15" stroke="var(--color-dg-gold)" stroke-width="0.012" stroke-dasharray="0.04 0.03" />
{/snippet}

<main class="flex h-full flex-col gap-3 overflow-y-auto bg-dg-bg p-3 text-dg-text md:p-5 lg:flex-row" data-testid="dungeon-map">
  <div class="flex flex-col gap-2 md:hidden">
    <PartyPanel {game} {names} compact />
    <ArtifactsPanel {game} {names} compact />
  </div>
  <section class="flex min-h-[420px] min-w-0 flex-1 flex-col gap-2 rounded-xl border border-dg-line bg-dg-panel p-3 md:p-4">
    <span class="font-display text-sm font-bold uppercase text-dg-muted">{cleared}</span>
    <h2 class="font-display text-2xl font-bold uppercase text-dg-gold md:text-3xl">Choose your path</h2>
    {#if reward}<p class="text-dg-gold" data-testid="reward">+{reward.gold} gold from the fight</p>{/if}
    {#if event}
      <ul class="text-sm" data-testid="event-outcome">
        {#each eventOutcomeLines(event, names) as line, i (i)}<li>{line}</li>{/each}
      </ul>
    {/if}
    <div class="min-h-0 flex-1 rounded-lg bg-dg-bg p-4 pl-6"><DungeonMap {game} /></div>
  </section>

  <div class="flex shrink-0 flex-col gap-3 lg:w-[640px]">
    <div class="hidden gap-3 md:grid md:grid-cols-2">
      <PartyPanel {game} {names} />
      <ArtifactsPanel {game} {names} />
    </div>
    <section class="flex flex-col gap-3 rounded-xl border border-dg-line bg-dg-panel p-3" aria-label="Vote">
      <div class="flex items-baseline justify-between gap-2">
        <h3 class="font-display text-lg font-bold uppercase text-dg-gold">Vote · where next?</h3>
        <span class="text-sm text-dg-muted">{vote.voted} of {vote.voters} voted · <span class="text-dg-text">{thrower} throws</span></span>
      </div>
      <div class="flex gap-3 md:hidden">
        {#each vote.sides as s (s.side)}{@render sideCard(s, true)}{/each}
      </div>
      {#if !viewOnly && next.enabled}
        <!-- Phones have no board here: the hero's vote is in, so the next one throws -->
        <button
          type="button"
          class="rounded-xl py-2 font-display text-lg font-bold uppercase md:hidden {next.prominent
            ? 'bg-dg-gold text-dg-bg'
            : 'border border-dg-line'}"
          onclick={onNext}>{next.label}</button
        >
      {/if}
      <div class="hidden items-stretch gap-3 md:flex">
        {#each vote.sides.filter(s => s.side === 'left') as s (s.side)}{@render sideCard(s, false)}{/each}
        <div class="w-72 shrink-0">
          <BoardOrKeypad
            {keypad}
            darts={game.currentVisitDarts}
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
            board={{ overlay: axis }}
          />
        </div>
        {#each vote.sides.filter(s => s.side === 'right') as s (s.side)}{@render sideCard(s, false)}{/each}
      </div>
      <p class="text-sm text-dg-muted">Throw at the left or the right half of the board. Most darts win; a tie is decided at random.</p>
    </section>
  </div>
</main>
