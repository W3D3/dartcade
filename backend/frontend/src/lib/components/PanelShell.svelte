<script lang="ts">
  // Frame of a player panel (1–2 players): avatar, name, optional aside (leg pips), pill.
  import type { Snippet } from 'svelte'
  import Avatar from './Avatar.svelte'
  import PlayerName from './PlayerName.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import type { PillKind } from './pills.js'
  import type { SeatLine } from '$lib/remote'
  import { nameTone, playerCard, type CardTone } from '$lib/playerCard'
  import { cn } from '$lib/utils.js'

  let {
    name,
    bot = null,
    active,
    solo = false,
    portrait = false,
    pill,
    pillInRow = false,
    seat = null,
    aside,
    children,
    waiting,
    tone = null,
    label,
    pillLabel,
    class: className,
  }: {
    name: string
    /** A bot seat: shows a robot glyph coloured by level instead of the name's initial. */
    bot?: { level: number } | null
    active: boolean
    solo?: boolean
    /** The portrait layout: side by side above the board, with the big sizes from `lg` (an upright monitor). */
    portrait?: boolean
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
    /** A state beyond throwing or waiting (a Higher Lower life just lost, out of the game). */
    tone?: CardTone
    /** The panel's accessible name, when the game says more than throwing or waiting. */
    label?: string
    /** The pill's text, when it differs from its kind's ("Out · 2nd"). */
    pillLabel?: string
    /** A layout's own width (121's solo card is narrower below xl). */
    class?: string
  } = $props()

  // Two players on tablets (md up to xl) get the smaller sizes; one player keeps the desktop ones
  const nameSize = $derived(solo ? 'text-[22px]' : portrait ? 'text-[19px] lg:text-[26px]' : 'text-[19px] xl:text-[22px]')
  const avatarSize = $derived(
    solo
      ? 'w-10 h-10 text-[17px]'
      : portrait
        ? 'w-[34px] h-[34px] text-[14px] lg:w-11 lg:h-11 lg:text-[18px]'
        : 'w-[34px] h-[34px] text-[14px] xl:w-10 xl:h-10 xl:text-[17px]',
  )
</script>

<section
  aria-label={label ?? `${name}, ${active ? 'throwing' : 'waiting'}`}
  class={cn(
    `@container ${
      solo
        ? 'w-[400px] shrink-0 p-6 gap-[18px]'
        : portrait
          ? 'flex-1 p-[18px] gap-3 lg:p-7 lg:gap-[14px]'
          : 'flex-1 p-[18px] gap-3 xl:p-7 xl:gap-[14px]'
    } min-w-0 min-h-0 box-border rounded-[18px] flex flex-col overflow-hidden ${playerCard(active, tone)}`,
    className,
  )}
>
  <div class="flex items-center {solo ? 'gap-3' : 'gap-[10px] xl:gap-3'} min-w-0">
    <Avatar {name} {bot} tone={active ? 'accent' : 'default'} class="{avatarSize} {tone === 'out' ? 'opacity-50' : ''}" />
    <PlayerName {name} {seat} nameClass="{nameSize} {nameTone(active, tone)}" youClass="text-[14px]" gap="gap-[3px]" seatSize="lg" />
    <span class="ml-auto flex items-center gap-3 shrink-0">
      {@render aside?.()}
      {#if pill && pillInRow}<PlayerPill kind={pill} label={pillLabel} />{/if}
    </span>
  </div>
  {#if pill && !pillInRow}<PlayerPill kind={pill} label={pillLabel} />{/if}
  {#if waiting}{@render waiting()}{:else}{@render children()}{/if}
</section>
