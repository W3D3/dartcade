<script lang="ts">
  // A player's name on the match screen, with "· you" for the viewer's own seat and a line under it:
  // the seat's board in remote games, or `below`. Without either (and not `stacked`) just the name.
  import type { Snippet } from 'svelte'
  import SeatBoardLine from './SeatBoardLine.svelte'
  import type { SeatLine } from '$lib/remote'

  let {
    name,
    seat = null,
    you = seat?.you ?? false,
    stacked = false,
    nameClass,
    youClass,
    gap,
    leading = 'leading-[1.1]',
    seatSize = 'md',
    below,
  }: {
    name: string
    /** Remote games: the seat's board under the name, and "· you". */
    seat?: SeatLine | null
    you?: boolean
    /** Keep the column (and its leading) even without a seat. */
    stacked?: boolean
    /** Size and colour of the name. */
    nameClass: string
    /** Size of "· you". */
    youClass: string
    /** Gap between the name and the line under it. */
    gap: string
    /** Line height of the name in the column. */
    leading?: string
    seatSize?: 'sm' | 'md' | 'lg'
    /** Shown under the name instead of the seat's board. */
    below?: Snippet
  } = $props()
</script>

{#if seat || stacked || below}
  <span class="flex flex-col {gap} min-w-0">
    <span class="{nameClass} {leading} font-semibold truncate"
      >{name}{#if you}<span class="{youClass} font-medium text-accent"> · you</span>{/if}</span
    >
    {#if below}{@render below()}{:else if seat}<SeatBoardLine line={seat} size={seatSize} />{/if}
  </span>
{:else}
  <span class="{nameClass} font-semibold truncate">{name}</span>
{/if}
