<script lang="ts">
  // What your visits score (Stats.dc.html): the share of visits in each range, now (lime) next to
  // the range before (grey), the share written over each lime bar.
  import type { X01Stats } from '$lib/api'
  import { axis } from '$lib/stats/view'

  let { buckets }: { buckets: X01Stats['scoring']['buckets'] } = $props()

  const W = 440
  const H = 200
  const LEFT = 34
  const RIGHT = 436
  const TOP = 18
  const BASE = 172

  const ax = $derived(axis([...buckets.flatMap(b => [b.now * 100, (b.before ?? 0) * 100]), 10], 10))
  const y = (share: number) => BASE - ((share * 100 - ax.lo) / (ax.hi - ax.lo)) * (BASE - TOP)
  const slot = $derived((RIGHT - LEFT) / buckets.length)
  const label = (share: number) => (share > 0 && share < 0.02 ? `${(share * 100).toFixed(1)}%` : `${Math.round(share * 100)}%`)
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="Share of visits per score range" class="block h-auto w-full">
  {#each ax.ticks as t (t)}
    <path d="M{LEFT} {y(t / 100)}H{RIGHT}" class="stroke-surface-paused" />
    <text x={LEFT - 8} y={y(t / 100) + 4} text-anchor="end" font-size="10" class="fill-text-dim">{t}%</text>
  {/each}
  {#each buckets as b, i (b.label)}
    {@const x = LEFT + i * slot + slot * 0.18}
    {@const w = slot * 0.32}
    <rect {x} y={y(b.now)} width={w} height={BASE - y(b.now)} rx="2" class="fill-accent" />
    {#if b.before !== null}
      <rect x={x + w + 2} y={y(b.before)} width={w} height={BASE - y(b.before)} rx="2" class="fill-line-3" />
    {/if}
    {#if b.now > 0}
      <text x={x + w / 2} y={y(b.now) - 5} text-anchor="middle" font-size="10" class="fill-text">{label(b.now)}</text>
    {/if}
    <text x={LEFT + (i + 0.5) * slot} y={H - 10} text-anchor="middle" font-size="10" class="fill-text-dim">{b.label}</text>
  {/each}
</svg>
