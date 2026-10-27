<script lang="ts" generics="S">
  // The seats of a game: cards side by side, or rows stacked from three seats on.
  import type { Snippet } from 'svelte'

  let {
    seats,
    party,
    card,
    row,
    portrait = false,
    cardsHeight = 0,
  }: {
    seats: S[]
    party: boolean
    card: Snippet<[S]>
    row: Snippet<[S]>
    portrait?: boolean
    /** Portrait only: the height (px) of the row of cards. */
    cardsHeight?: number
  } = $props()
</script>

{#if party}
  <div class="flex min-h-0 flex-col gap-3.5 {portrait ? 'flex-[1.4_1_0]' : 'flex-1'}">
    {#each seats as s, i (i)}{@render row(s)}{/each}
  </div>
{:else}
  <div class="flex gap-[22px] {portrait ? 'flex-none' : 'min-h-0 flex-1'}" style:height={portrait ? `${cardsHeight}px` : undefined}>
    {#each seats as s, i (i)}{@render card(s)}{/each}
  </div>
{/if}
