<!--
  Between holes (Minigolf-Scorecard.dc.html): the scorecard so far, everyone's strokes on the hole
  just finished, and who tees off next. The game waits on it: the host starts the next hole.
-->
<script lang="ts">
  import type { MinigolfGame } from '$lib/api'
  import Scorecard from './Scorecard.svelte'
  import HoleShots from './HoleShots.svelte'
  import { teeOffLine } from '$lib/minigolf/scorecard'

  let { game, players, host, onnext }: { game: MinigolfGame; players: { name: string }[]; host: boolean; onnext: () => void } = $props()

  const last = $derived(game.lastHole)

  // The order was re-sorted by the last hole's scores: tees off first by score unless it's still seat order
  const first = $derived(game.order[0])
  const byScore = $derived(game.order.some((s, i) => s !== i))
</script>

{#if last}
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-[#0f100ee6] p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Scorecard"
  >
    <div class="flex max-h-full w-full max-w-[1100px] flex-col gap-5 overflow-y-auto rounded-2xl border border-line bg-surface-1 p-6">
      <header class="flex flex-wrap items-baseline justify-between gap-3">
        <h2 class="m-0 font-display text-[32px] font-bold uppercase">Hole {last.index + 1} · {last.hole.name} · done</h2>
        <span class="text-text-muted">Par {last.hole.par}</span>
      </header>
      <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <Scorecard scores={game.scores} pars={game.pars} {players} />
        <HoleShots hole={last.hole} paths={last.paths} scores={last.scores} {players} label="Everyone's strokes on hole {last.index + 1}" />
      </div>
      <footer class="flex flex-wrap items-center gap-4 rounded-xl bg-surface-2 px-4 py-3">
        <span class="flex flex-col">
          <span class="text-[12px] uppercase tracking-[0.12em] text-text-muted">Up next · Hole {game.holeIdx + 1}</span>
          <strong class="font-display text-[22px] uppercase">{game.hole.name} · Par {game.hole.par}</strong>
          <span class="text-[14px] text-text-muted">{teeOffLine(players[first]?.name ?? '', byScore)}</span>
        </span>
        {#if host}
          <button
            type="button"
            class="ml-auto h-11 rounded-[10px] border-0 bg-accent px-5 font-display text-[18px] font-bold uppercase text-accent-fg cursor-pointer hover:bg-accent-hover"
            onclick={onnext}>Next hole</button
          >
        {:else}
          <span class="ml-auto text-text-muted" aria-live="polite">Waiting for the host to start the next hole</span>
        {/if}
      </footer>
    </div>
  </div>
{/if}
