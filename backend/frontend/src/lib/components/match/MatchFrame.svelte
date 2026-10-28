<!--
  The match screen's frame: the <main> for each layout (matchLayout: phone, portrait, solo, duel,
  party, teams) with its padding and direction, and the game's content for that layout. A game
  passes one snippet per layout it draws; solo and teams fall back to the party layout.
  The layout rule itself (one panel per side for two players, stacked rows beside the board for
  three or more, players on top in portrait) is the game's to follow inside the snippets.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { MatchLayout } from '$lib/matchLayout'

  type Side = 'solo' | 'duel' | 'party' | 'teams'

  let {
    layout,
    phone,
    portrait,
    solo,
    duel,
    party,
    teams,
    phoneScroll = true,
    side = {},
  }: {
    layout: MatchLayout
    phone: Snippet
    portrait: Snippet
    solo?: Snippet
    duel: Snippet
    party: Snippet
    teams?: Snippet
    /** Phones: the page scrolls (false: everything is sized to fit, the board takes what's left). */
    phoneScroll?: boolean
    /** A side-by-side layout's padding, gaps and display, in place of `px-7 py-6 flex gap-6`. */
    side?: Partial<Record<Side, string>>
  } = $props()

  // The side-by-side layouts: solo and teams fall back to party
  const body: Snippet = $derived(
    layout === 'solo' ? (solo ?? party) : layout === 'duel' ? duel : layout === 'teams' ? (teams ?? party) : party,
  )
  const sideClass = $derived(
    (layout === 'solo' ? side.solo : layout === 'duel' ? side.duel : layout === 'teams' ? side.teams : side.party) ??
      'px-7 py-6 flex gap-6',
  )
</script>

{#if layout === 'phone'}
  <main
    class="flex-grow min-h-0 {phoneScroll
      ? 'overflow-y-auto'
      : 'overflow-hidden'} box-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] flex flex-col gap-2"
  >
    {@render phone()}
  </main>
{:else if layout === 'portrait'}
  <main class="flex-grow min-h-0 box-border px-5 pt-4 pb-5 gap-3 lg:px-7 lg:pt-6 lg:pb-7 lg:gap-[18px] flex flex-col">
    {@render portrait()}
  </main>
{:else}
  <main class="flex-grow min-h-0 box-border {sideClass}">
    {@render body()}
  </main>
{/if}
