<script lang="ts">
  // The Play page's games by category: an illustrated card per game, a strip row for the small
  // ones (phones: two cards a row, name only; tablets: smaller cards than desktops). Once a game
  // is picked (`open`, from lg) they shrink to a column of name rows beside its settings, and the
  // coming-soon ones drop out. Modes behind a feature flag that's off aren't shown.
  import GameCard from './GameCard.svelte'
  import { GAME_CATEGORIES, shownModes } from '$lib/gameModes'

  let {
    selected,
    open,
    disabled = false,
    onselect,
  }: {
    selected: string | null
    /** A game is picked: name rows, not cards. */
    open: boolean
    /** Shown, not picked: the selected row stays marked. */
    disabled?: boolean
    onselect?: (id: string) => void
  } = $props()

  const modes = $derived($shownModes.filter(m => m.available || !open))
</script>

<div class="flex flex-col transition-[gap] duration-[450ms] {open ? 'gap-[14px]' : 'gap-5'}">
  {#each GAME_CATEGORIES as cat (cat.id)}
    {@const games = modes.filter(m => m.cat === cat.id)}
    {@const big = games.filter(m => !m.small)}
    {@const small = games.filter(m => m.small)}
    {#if games.length > 0}
      <section aria-label={cat.name} class="flex flex-col {open ? 'gap-[6px]' : 'gap-2 md:gap-[10px]'}">
        <div class="flex items-baseline gap-2 md:gap-[10px] whitespace-nowrap">
          <h2
            class="m-0 font-display font-bold leading-none uppercase tracking-[0.06em] transition-all duration-[450ms] {open
              ? 'text-[15px] text-text-dim'
              : 'text-[18px] md:text-[22px] text-text'}"
          >
            {cat.name}
          </h2>
          {#if !open}<span class="text-[12px] md:text-[13px] text-text-dim">{cat.sub}</span>{/if}
        </div>
        {#if big.length > 0}
          <div class="cards" class:open>
            {#each big as g (g.id)}<GameCard game={g} {open} on={open && g.id === selected} {disabled} {onselect} />{/each}
          </div>
        {/if}
        {#if small.length > 0}
          <div class="strips" class:open>
            {#each small as g (g.id)}<GameCard game={g} {open} on={open && g.id === selected} {disabled} {onselect} />{/each}
          </div>
        {/if}
      </section>
    {/if}
  {/each}
</div>

<style>
  /* Phones: two cards a row and the strips below; from md they wrap side by side; open: one column */
  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .strips {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  @media (min-width: 768px) {
    .cards,
    .strips {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 12px;
    }
  }
  .cards.open,
  .strips.open {
    flex-direction: column;
    gap: 6px;
  }
</style>
