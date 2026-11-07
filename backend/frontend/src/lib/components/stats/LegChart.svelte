<script lang="ts">
  // Average per leg (Stats.dc.html): a bar per leg, darker when lost, the best one lime with its
  // label; the 10-leg trend over them and the range before's average dashed across.
  import type { X01Stats } from '$lib/api'
  import { axis, dec1 } from '$lib/stats/view'

  let { legs, before, beforeLabel }: { legs: X01Stats['overview']['perLeg']; before: number | null; beforeLabel: string | null } = $props()

  const W = 700
  const H = 230
  const LEFT = 36
  const RIGHT = 690
  const TOP = 12
  const BASE = 204

  const shown = $derived(legs.flatMap(l => (l.average === null ? [] : [l.average])))
  const ax = $derived(axis([...shown, ...(before === null ? [] : [before])], 20))
  const y = (v: number) => BASE - ((Math.max(v, ax.lo) - ax.lo) / (ax.hi - ax.lo)) * (BASE - TOP)
  const slot = $derived((RIGHT - LEFT) / Math.max(1, legs.length))
  const x = (i: number) => LEFT + i * slot + slot / 2
  const best = $derived(legs.reduce((b, l, i) => ((l.average ?? -1) > (legs[b]?.average ?? -1) ? i : b), 0))
  const trend = $derived(
    legs
      .map((l, i) => (l.trend === null ? null : `${x(i).toFixed(1)},${y(l.trend).toFixed(1)}`))
      .filter(Boolean)
      .join(' '),
  )
  const bestLeg = $derived(legs[best])
  const bestLabel = $derived(bestLeg.won ? `${bestLeg.darts}-darter · ${dec1(bestLeg.average)}` : dec1(bestLeg.average))
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="3-dart average per leg, {legs.length} legs" class="block h-auto w-full">
  {#each ax.ticks as t (t)}
    <path d="M{LEFT} {y(t)}H{RIGHT}" class="stroke-surface-paused" />
    <text x={LEFT - 8} y={y(t) + 4} text-anchor="end" font-size="11" class="fill-text-dim">{t}</text>
  {/each}
  {#each legs as l, i (i)}
    {#if l.average !== null}
      <rect
        x={x(i) - slot * 0.35}
        y={y(l.average)}
        width={slot * 0.7}
        height={Math.max(2, BASE - y(l.average))}
        rx="2"
        class={i === best ? 'fill-accent' : l.won ? 'fill-accent-line' : 'fill-line-3'}
      />
    {/if}
  {/each}
  {#if before !== null}
    <path d="M{LEFT} {y(before)}H{RIGHT}" class="stroke-text-muted" stroke-dasharray="4 4" />
    {#if beforeLabel}
      <text x={LEFT + 6} y={y(before) - 6} font-size="11" class="fill-text-muted">{beforeLabel} · avg {dec1(before)}</text>
    {/if}
  {/if}
  <polyline points={trend} fill="none" class="stroke-accent" stroke-width="2.5" stroke-linejoin="round" />
  {#if bestLeg.average !== null}
    {@const left = x(best) > W / 2}
    <circle cx={x(best)} cy={y(bestLeg.average)} r="4" class="fill-bg stroke-accent" stroke-width="2" />
    <text
      x={x(best) + (left ? -8 : 8)}
      y={y(bestLeg.average) + 4}
      text-anchor={left ? 'end' : 'start'}
      font-size="11"
      font-weight="600"
      class="fill-text">{bestLabel}</text
    >
  {/if}
  <text x={LEFT} y={H - 4} font-size="11" class="fill-text-dim">{legs.length} {legs.length === 1 ? 'leg' : 'legs'} ago</text>
  <text x={RIGHT} y={H - 4} text-anchor="end" font-size="11" class="fill-text-dim">latest</text>
</svg>
