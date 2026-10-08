<script lang="ts">
  // Race to the Bull (ATC-Details*): targets hit against darts thrown, one line per player; the
  // highlighted (you, or the winner) in lime.
  import type { GameDetail } from '$lib/api'
  import { raceSeries } from '$lib/details/atc'

  let { detail, highlight = null }: { detail: GameDetail; highlight?: number | null } = $props()
  const atc = $derived(detail.detail.mode === 'atc' ? detail.detail : null)
  const series = $derived(atc ? raceSeries(atc) : [])
  const total = $derived(Math.max(1, atc?.sequence.length ?? 0))
  const maxDarts = $derived(Math.max(3, ...series.flatMap(s => s.points.map(p => p.darts))))
  const W = 720,
    H = 220,
    L = 36,
    R = 700,
    T = 12,
    B = 196
  const x = (darts: number) => L + (darts / maxDarts) * (R - L)
  const y = (hits: number) => B - (hits / total) * (B - T)
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
</script>

{#if atc}
  <section aria-label="Race to the Bull" class="flex flex-col gap-2 min-w-0 box-border p-4 md:p-6 card">
    <h2 class="m-0 font-display font-bold text-[24px] md:text-[28px] leading-none uppercase">Race to the Bull</h2>
    <p class="m-0 text-[13px] text-text-muted">Targets hit against darts thrown</p>
    <svg viewBox="0 0 {W} {H}" class="w-full h-auto" role="img" aria-label="Targets hit against darts thrown">
      <line x1={L} x2={R} y1={B} y2={B} stroke="var(--color-line)" />
      {#each series as s (s.seat)}
        {@const on = s.seat === highlight}
        <path
          d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.darts)} ${y(p.hits)}`).join(' ')}
          fill="none"
          stroke={on ? 'var(--color-accent)' : 'var(--color-line-pip)'}
          stroke-width={on ? 2.5 : 1.5}
          stroke-dasharray={on ? undefined : '4 4'}
        />
        <text x={x(s.points.at(-1)?.darts ?? 0) + 6} y={y(s.points.at(-1)?.hits ?? 0) + 4} fill="var(--color-text-muted)" font-size="12"
          >{nameOf(s.seat)}</text
        >
      {/each}
    </svg>
  </section>
{/if}
