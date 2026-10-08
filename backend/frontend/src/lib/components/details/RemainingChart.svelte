<script lang="ts">
  // Points left after each visit, one line per side (X01-Details): lime for the highlighted (or
  // first) side, dashed grey for the others; a ring on 100+ visits, a bigger one on 180.
  import { remainingTicks, type Side } from '$lib/details/x01'

  type Point = { visit: number; left: number; scored: number }
  let {
    series,
    sides,
    start,
    highlight = null,
  }: { series: { key: number; points: Point[] }[]; sides: Side[]; start: number; highlight?: number | null } = $props()

  const W = 720,
    H = 200,
    L = 44,
    R = 700,
    T = 12,
    B = 184
  const maxVisits = $derived(Math.max(1, ...series.map(s => s.points.length - 1)))
  const x = (i: number) => L + (i * (R - L)) / maxVisits
  const y = (left: number) => T + (1 - left / start) * (B - T)
  const lead = $derived(highlight === null ? (series[0]?.key ?? 0) : highlight)
  const name = (key: number) => sides.find(s => s.key === key)?.name ?? ''
  const ticks = $derived(remainingTicks(start))
</script>

<figure class="m-0 flex flex-col gap-2">
  <figcaption class="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-muted">
    <span>Points remaining after each visit</span>
    {#each series as s (s.key)}
      <span class="inline-flex items-center gap-[6px] {s.key === lead ? 'ml-auto md:ml-0' : ''}"
        ><span class="w-4 h-[2px] {s.key === lead ? 'bg-accent' : 'bg-line-pip'}"></span>{name(s.key)}</span
      >
    {/each}
  </figcaption>
  <svg viewBox="0 0 {W} {H}" class="w-full h-auto" role="img" aria-label="Points left after each visit">
    {#each ticks as t (t)}
      <line x1={L} x2={R} y1={y(t)} y2={y(t)} class="stroke-line" stroke-width="1" />
      <text x={L - 8} y={y(t) + 4} text-anchor="end" class="fill-text-dim text-[11px]">{t}</text>
    {/each}
    {#each series as s (s.key)}
      {@const on = s.key === lead}
      <path
        d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.left)}`).join(' ')}
        fill="none"
        stroke-width={on ? 2.5 : 1.5}
        stroke-dasharray={on ? undefined : '4 4'}
        class={on ? 'stroke-accent' : 'stroke-line-pip'}
      />
      {#each s.points as p, i (i)}
        {#if p.scored >= 100}
          <circle
            cx={x(i)}
            cy={y(p.left)}
            r={p.scored === 180 ? 10 : 7}
            fill="none"
            stroke-width={p.scored === 180 ? 3 : 1.5}
            class={on ? 'stroke-accent' : 'stroke-line-pip'}
          />
        {/if}
      {/each}
    {/each}
  </svg>
</figure>
