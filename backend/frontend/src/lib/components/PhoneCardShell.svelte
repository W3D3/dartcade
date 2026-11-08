<script lang="ts">
  import type { Who } from '$lib/face'
  // Frame of the thrower's card on a phone: the card, and its header with the avatar, name (and board
  // in remote games) and pill, plus an optional `aside` at its end. The game's content goes in `children`.
  import type { Snippet } from 'svelte'
  import Avatar from './Avatar.svelte'
  import PlayerName from './PlayerName.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import type { PillKind } from './pills.js'
  import RankChip from './ranked/RankChip.svelte'
  import type { SeatRank } from '$lib/ranked/inGame'
  import type { SeatLine } from '$lib/remote'
  import { ACTIVE_CARD } from '$lib/playerCard'

  let {
    who,
    label,
    pill,
    seat,
    class: className,
    aside,
    rank = null,
    children,
  }: {
    who: Who
    /** The card's accessible name. */
    label: string
    pill: PillKind | null
    seat: SeatLine | null
    /** Gap between the header and the content. */
    class: string
    aside?: Snippet
    /** A ranked game: the seat's rank chip under the header. */
    rank?: SeatRank | null
    children: Snippet
  } = $props()
  const name = $derived(who.name)
</script>

<section aria-label={label} class="shrink-0 box-border px-[14px] pt-3 pb-[14px] rounded-popover {ACTIVE_CARD} flex flex-col {className}">
  <div class="flex items-center gap-2 min-w-0">
    <Avatar name={who.name} face={who.face} tone="accent" size={30} />
    <PlayerName {name} {seat} stacked nameClass="text-[16px]" youClass="text-[12px]" gap="gap-[1px]" seatSize="sm" />
    {#if pill}<PlayerPill kind={pill} small />{/if}
    {@render aside?.()}
  </div>
  {#if rank}<div class="mt-1"><RankChip rank={rank.rank} rating={rank.rating} /></div>{/if}
  {@render children()}
</section>
