<script lang="ts">
  // Average by visit (Stats.dc.html): the average of each visit of a leg, now (lime, with its
  // numbers) and the range before (dashed); the first three visits shaded as the first 9.
  import type { X01Stats } from '$lib/api'
  import { axis, dec1 } from '$lib/stats/view'

  let { visits }: { visits: X01Stats['scoring']['byVisit'] } = $props()

  const W = 440
  const H = 200
  const LEFT = 34
  const RIGHT = 428
  const TOP = 16
  const BASE = 172

  const values = $derived(visits.flatMap(v => [v.now, v.before]).filter(v => v !== null))
  const ax = $derived(axis(values.length > 0 ? values : [0, 10], 10))
  const x = (i: number) => LEFT + (i / Math.max(1, visits.length - 1)) * (RIGHT - LEFT)
  const y = (v: number) => BASE - ((v - ax.lo) / (ax.hi - ax.lo)) * (BASE - TOP)
  const line = (key: 'now' | 'before') =>
    visits
      .flatMap((v, i) => {
        const value = v[key]
        return value === null ? [] : [`${x(i).toFixed(1)},${y(value).toFixed(1)}`]
      })
      .join(' ')
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="Average score of each visit in a leg" class="block h-auto w-full">
  <rect x={x(0) - 8} y={TOP} width={x(2) - x(0) + 16} height={BASE - TOP} class="fill-accent/5" />
  <text x={(x(0) + x(2)) / 2} y={BASE - 6} text-anchor="middle" font-size="10" class="fill-accent">First 9</text>
  {#each ax.ticks as t (t)}
    <text x={LEFT - 10} y={y(t) + 4} text-anchor="end" font-size="10" class="fill-text-dim">{t}</text>
  {/each}
  <polyline points={line('before')} fill="none" class="stroke-text-muted" stroke-width="1.5" stroke-dasharray="4 4" />
  <polyline points={line('now')} fill="none" class="stroke-accent" stroke-width="2.5" stroke-linejoin="round" />
  {#each visits as v, i (v.visit)}
    {#if v.now !== null}
      <circle cx={x(i)} cy={y(v.now)} r="3.5" class="fill-accent" />
      <text x={x(i)} y={y(v.now) - 9} text-anchor="middle" font-size="10" class="fill-text">{dec1(v.now)}</text>
    {/if}
    <text x={x(i)} y={H - 10} text-anchor="middle" font-size="10" class="fill-text-dim">{v.visit}</text>
  {/each}
</svg>
