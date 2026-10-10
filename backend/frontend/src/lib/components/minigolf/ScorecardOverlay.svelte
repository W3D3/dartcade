<!--
  Between holes (Minigolf-Scorecard.dc.html): the scorecard so far, everyone's strokes on the hole
  just finished, and who tees off next. Closes after 8 seconds, on "Next hole now", or as soon as
  the next hole's first dart lands (the game is already on it).
-->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { MinigolfGame } from '$lib/api'
  import Scorecard from './Scorecard.svelte'
  import { SEAT_COLOURS, teeOffLine } from '$lib/minigolf/scorecard'
  import { bounds } from '$shared/minigolf/geometry'
  import type { Pt } from '$shared/minigolf/types'

  let { game, players, onclose }: { game: MinigolfGame; players: { name: string }[]; onclose: () => void } = $props()

  const last = $derived(game.lastHole)
  let seconds = $state(8)
  const timer = setInterval(() => {
    seconds -= 1
    if (seconds <= 0) onclose()
  }, 1000)
  onDestroy(() => clearInterval(timer))

  const pt = (p: number[]): Pt => [p[0] ?? 0, p[1] ?? 0]
  const pts = (p: number[][]) => p.map(q => `${q[0] ?? 0},${q[1] ?? 0}`).join(' ')
  const viewBox = $derived.by(() => {
    if (!last) return '0 0 1 1'
    const b = bounds(last.hole.outline.map(pt))
    return `${b.minX - 80} ${b.minY - 80} ${b.maxX - b.minX + 160} ${b.maxY - b.minY + 160}`
  })
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
        <figure class="m-0 flex flex-col gap-2">
          <svg
            {viewBox}
            class="max-h-[300px] w-full rounded-xl bg-bg-deep"
            role="img"
            aria-label="Everyone's strokes on hole {last.index + 1}"
          >
            <polygon points={pts(last.hole.outline)} fill="#2a7045" stroke="#e9dfc4" stroke-width="20" stroke-linejoin="round" />
            <circle cx={last.hole.cup.at[0]} cy={last.hole.cup.at[1]} r={last.hole.cup.r} fill="#050604" />
            {#each last.paths as strokes, seat (seat)}
              {#each strokes as path, k (k)}
                <polyline
                  points={pts(path)}
                  fill="none"
                  stroke={SEAT_COLOURS[seat % SEAT_COLOURS.length]}
                  stroke-width="14"
                  stroke-opacity="0.8"
                  stroke-linecap="round"
                />
              {/each}
            {/each}
          </svg>
          <figcaption class="flex flex-wrap gap-3 text-[13px]">
            {#each players as p, seat (seat)}
              <span class="flex items-center gap-1">
                <span class="inline-block size-3 rounded-full" style:background={SEAT_COLOURS[seat % SEAT_COLOURS.length]}></span>
                {p.name} · {last.scores[seat]}
              </span>
            {/each}
          </figcaption>
        </figure>
      </div>
      <footer class="flex flex-wrap items-center gap-4 rounded-xl bg-surface-2 px-4 py-3">
        <span class="flex flex-col">
          <span class="text-[12px] uppercase tracking-[0.12em] text-text-muted">Up next · Hole {game.holeIdx + 1}</span>
          <strong class="font-display text-[22px] uppercase">{game.hole.name} · Par {game.hole.par}</strong>
          <span class="text-[14px] text-text-muted">{teeOffLine(players[first]?.name ?? '', byScore)}</span>
        </span>
        <span class="ml-auto text-text-muted" aria-live="polite">Starting in 0:0{Math.max(0, seconds)}</span>
        <button
          type="button"
          class="h-11 rounded-[10px] border-0 bg-accent px-5 font-display text-[18px] font-bold uppercase text-accent-fg cursor-pointer hover:bg-accent-hover"
          onclick={onclose}>Next hole now</button
        >
      </footer>
    </div>
  </div>
{/if}
