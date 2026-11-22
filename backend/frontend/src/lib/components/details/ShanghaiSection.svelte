<script lang="ts">
  // Round by round (the details page): what each player scored on each round's number, a Shanghai in
  // lime, a round not played (the game ended early) empty. Sudden-death bull rounds follow the regular ones.
  import type { GameDetail } from '$lib/api'
  import { targetLabel } from '$lib/shanghai/view'

  let { detail }: { detail: GameDetail } = $props()
  const sh = $derived(detail.detail.mode === 'shanghai' ? detail.detail : null)
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
  const rounds = $derived(
    sh
      ? Array.from({ length: Math.max(sh.targets.length, ...sh.visits.map(v => v.round)) }, (_, i) => ({
          round: i + 1,
          target: sh.targets[i] ?? 25,
        }))
      : [],
  )
  const cell = (seat: number, round: number) => sh?.visits.find(v => v.seat === seat && v.round === round)
  const cols = $derived(`minmax(72px, 120px) repeat(${rounds.length}, minmax(28px, 1fr))`)
</script>

{#if sh}
  <section aria-label="Round by round" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
    <h2 class="font-display font-bold text-2xl md:text-card-title leading-none uppercase">Round by round</h2>
    <div class="overflow-x-auto">
      <div class="grid gap-1 items-center min-w-[420px]" style:grid-template-columns={cols}>
        <span></span>
        {#each rounds as r (r.round)}<span class="text-center text-caption text-text-dim">{targetLabel(r.target)}</span>{/each}
        {#each sh.seats as _, seat (seat)}
          <span class="text-sm font-semibold truncate pr-2">{nameOf(seat)}</span>
          {#each rounds as r (r.round)}
            {@const v = cell(seat, r.round)}
            <span
              title="{targetLabel(r.target)}: {v ? (v.single && v.double && v.treble ? 'Shanghai' : `${v.score} points`) : 'not played'}"
              class="h-8 flex items-center justify-center rounded-chip text-small font-semibold
                     {v
                ? v.single && v.double && v.treble
                  ? 'bg-accent text-accent-fg'
                  : 'bg-surface-chip'
                : 'border border-dashed border-line-dashed'}">{v ? (v.score === 0 ? '–' : v.score) : ''}</span
            >
          {/each}
        {/each}
      </div>
    </div>
  </section>
{/if}
