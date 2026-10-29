<script lang="ts">
  // Cricket match details (Cricket-Details*): a leg selector and the picked leg's final marks,
  // reusing the match screen's MarksGrid. Marks never animate here: `from` is `game.marks`
  // itself, so every cell starts (and stays) at its final count.
  import type { GameDetail } from '$lib/api'
  import MarksGrid from '$lib/components/cricket/MarksGrid.svelte'
  import { legMarksGame, playersBySeat } from '$lib/details/cricket'
  import { cricketSides } from '$lib/cricket/view'

  let { detail }: { detail: GameDetail } = $props()

  const cricket = $derived(detail.detail.mode === 'cricket' ? detail.detail : null)
  const legs = $derived(cricket?.legs ?? [])
  // Default to the last leg played; cricket's marks reset per leg, so "every leg at once" (as
  // X01's breakdown does) wouldn't mean anything here.
  let legSel = $state<number | null>(null)
  const current = $derived(legSel ?? legs.at(-1)?.leg ?? 0)
  const leg = $derived(legs.find(l => l.leg === current) ?? null)
  const game = $derived(cricket && leg ? legMarksGame(cricket, leg) : null)
  const sides = $derived(game ? cricketSides(game, playersBySeat(detail.game.players)) : [])
  // `legMarksGame` already turns `leg.winner` (a seat) into the winning side's index (a team in
  // a team game), so `sides[game.winner]` names it right either way.
  const winnerName = $derived(typeof game?.winner === 'number' ? (sides[game.winner]?.name ?? '') : '')
</script>

{#if cricket && leg && game}
  <section aria-label="Leg by leg" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="m-0 font-display font-bold text-[24px] md:text-[32px] leading-none uppercase">Final marks</h2>
      {#if legs.length > 1}
        <div role="group" aria-label="Leg" class="flex flex-wrap gap-1 p-1 bg-bg rounded-[10px]">
          {#each legs as l (l.leg)}
            <button
              type="button"
              aria-pressed={l.leg === current}
              onclick={() => (legSel = l.leg)}
              class="h-10 min-w-[72px] md:min-w-24 px-3 border-0 rounded-[7px] font-[inherit] text-[15px] cursor-pointer
                 {l.leg === current ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">Leg {l.leg + 1}</button
            >
          {/each}
        </div>
      {/if}
    </div>
    <p class="m-0 text-[15px] text-text-muted">
      {#if leg.winner !== null}
        <strong class="text-text">{winnerName}</strong> won leg {leg.leg + 1}:
        {sides.map((s, i) => `${s.name} ${leg.points[i] ?? 0}`).join(' – ')}
      {:else}
        Leg {leg.leg + 1}: not finished
      {/if}
    </p>
    <MarksGrid {game} {sides} from={game.marks} variant="duel" />
  </section>
{/if}
