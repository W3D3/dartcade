<script lang="ts">
  // Frame of a player panel (1–2 players): avatar, name, optional aside (leg pips), pill.
  import type { Snippet } from 'svelte'
  import Avatar from './Avatar.svelte'
  import PlayerName from './PlayerName.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import type { PillKind } from './pills.js'
  import type { SeatLine } from '$lib/remote'
  import { playerCard } from '$lib/playerCard'

  let {
    name,
    active,
    solo = false,
    pill,
    pillInRow = false,
    seat = null,
    aside,
    children,
    waiting,
  }: {
    name: string
    active: boolean
    solo?: boolean
    pill: PillKind | null
    /** Put the pill at the end of the name row (ATC and solo) instead of under it. */
    pillInRow?: boolean
    /** Remote games: the seat's board under the name, and "· you". */
    seat?: SeatLine | null
    aside?: Snippet
    children: Snippet
    /** Disconnected seat: shown instead of the game content, below the name row and pill,
     * inside the panel's own padding so the border and pill stay visible. */
    waiting?: Snippet
  } = $props()

  // Two players on tablets (md up to xl) get the smaller sizes; one player keeps the desktop ones
  const nameSize = $derived(solo ? 'text-[22px]' : 'text-[19px] xl:text-[22px]')
</script>

<section
  aria-label="{name}, {active ? 'throwing' : 'waiting'}"
  class="@container {solo
    ? 'w-[400px] shrink-0 p-6 gap-[18px]'
    : 'flex-1 p-[18px] gap-3 xl:p-7 xl:gap-[14px]'} min-w-0 min-h-0 box-border rounded-[18px] flex flex-col overflow-hidden
         {playerCard(active)}"
>
  <div class="flex items-center {solo ? 'gap-3' : 'gap-[10px] xl:gap-3'} min-w-0">
    <Avatar
      {name}
      tone={active ? 'accent' : 'default'}
      class={solo ? 'w-10 h-10 text-[17px]' : 'w-[34px] h-[34px] text-[14px] xl:w-10 xl:h-10 xl:text-[17px]'}
    />
    <PlayerName
      {name}
      {seat}
      nameClass="{nameSize} {active ? 'text-text' : 'text-ink-2'}"
      youClass="text-[14px]"
      gap="gap-[3px]"
      seatSize="lg"
    />
    <span class="ml-auto flex items-center gap-3 shrink-0">
      {@render aside?.()}
      {#if pill && pillInRow}<PlayerPill kind={pill} />{/if}
    </span>
  </div>
  {#if pill && !pillInRow}<PlayerPill kind={pill} />{/if}
  {#if waiting}{@render waiting()}{:else}{@render children()}{/if}
</section>
