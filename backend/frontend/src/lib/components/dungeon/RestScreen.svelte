<script lang="ts">
  // A rest room (Dungeon-Pixel-Rest, -Fire, and the phone board): each living hero in turn throws one
  // visit and heals by its score, up to their max HP. The board takes the darts as in a fight.
  import type { DungeonGame } from '$lib/api/game-ws'
  import type { MatchControls } from '$lib/components/match/types'
  import VisitPanel from './VisitPanel.svelte'

  let { game, names, ...controls }: MatchControls & { game: DungeonGame; names: string[] } = $props()

  const hero = $derived(game.heroes[game.currentPlayer])
  const darts = $derived(game.currentVisitDarts)
  const heal = $derived(
    Math.min(
      hero.maxHp - hero.hp,
      darts.reduce((n, d) => n + d.score, 0),
    ),
  )
</script>

<main class="flex h-full flex-col items-center gap-3 overflow-y-auto bg-dg-bg p-3 text-dg-text md:p-5" data-testid="dungeon-rest">
  <h2 class="font-display text-2xl font-bold uppercase text-dg-gold">Rest · floor {game.floor}</h2>
  <p class="text-dg-muted">Each hero throws one visit and heals by its score.</p>
  <ul class="flex w-full max-w-3xl flex-wrap justify-center gap-2">
    {#each game.heroes as h (h.seat)}
      <li class="rounded-lg border px-3 py-1 {h.seat === game.currentPlayer ? 'border-dg-gold' : 'border-dg-line'}" data-testid="hero">
        {names[h.seat]} · {h.hp}/{h.maxHp}
      </li>
    {/each}
  </ul>
  {#if game.lastHeal}
    <p data-testid="last-heal">{names[game.lastHeal.seat]} healed {game.lastHeal.amount}.</p>
  {/if}
  <p class="font-display text-lg font-bold uppercase">{names[game.currentPlayer]} rests · heals {heal}</p>
  <div class="flex w-full max-w-md flex-col gap-2">
    <VisitPanel {...controls} {darts} />
  </div>
</main>
