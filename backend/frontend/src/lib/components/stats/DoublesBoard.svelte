<script lang="ts">
  // Your doubles on the board (Stats.dc.html, Board view): the board drawn dim, each double (and
  // the bull) filled from grey at 0% to lime at 55% or more with its rate on it, the ones never
  // thrown at left dark.
  import { HALF, R, SEGS, segAngle } from '$shared/board'

  type Double = { target: string; hits: number; attempts: number }
  let { doubles }: { doubles: Double[] } = $props()

  const SIZE = 280
  const C = SIZE / 2
  const RB = 110
  const FULL = 0.55
  // The double ring drawn wider than a real board's, so its colours and numbers read
  const DOUBLE_IN = 0.84

  const byTarget = $derived(new Map(doubles.map(d => [d.target, d])))
  const pt = (r: number, a: number) => `${(C + r * RB * Math.cos(a)).toFixed(1)} ${(C - r * RB * Math.sin(a)).toFixed(1)}`
  /** The wedge of segment `i` between radii r0 and r1 (board units). */
  function wedge(i: number, r0: number, r1: number): string {
    const a = segAngle(i)
    return `M${pt(r0, a + HALF)} L${pt(r1, a + HALF)} A${r1 * RB} ${r1 * RB} 0 0 1 ${pt(r1, a - HALF)} L${pt(r0, a - HALF)} A${r0 * RB} ${r0 * RB} 0 0 0 ${pt(r0, a + HALF)}Z`
  }
  const fill = (d: Double | undefined) =>
    d
      ? `color-mix(in srgb, var(--color-accent) ${Math.round(Math.min(1, d.hits / d.attempts / FULL) * 100)}%, var(--color-line-3))`
      : 'var(--color-surface-1)'
  const title = (name: string, d: Double | undefined) =>
    d ? `${name}: ${Math.round((d.hits / d.attempts) * 100)}% (${d.hits} of ${d.attempts})` : `${name}: not tried yet`
  const bull = $derived(byTarget.get('Bull'))
</script>

<div class="flex flex-col items-center gap-2.5">
  <svg width={SIZE} height={SIZE} viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="Double hit rate on the board" class="block max-w-full">
    <circle cx={C} cy={C} r={C - 2} class="fill-bg-deep" />
    {#each SEGS as n, i (n)}
      {@const d = byTarget.get(`D${n}`)}
      {@const a = segAngle(i)}
      {@const single = i % 2 ? 'fill-surface-inset' : 'fill-surface-active'}
      <path d={wedge(i, R.bull25, R.si)} class={single} />
      <path d={wedge(i, R.si, R.tr)} class="fill-line" />
      <path d={wedge(i, R.tr, DOUBLE_IN)} class={single} />
      <path d={wedge(i, DOUBLE_IN, R.db)} style:fill={fill(d)} class="stroke-bg"><title>{title(`D${n}`, d)}</title></path>
      {#if d && d.hits / d.attempts >= 0.2}
        <text
          x={C + 0.92 * RB * Math.cos(a)}
          y={C - 0.92 * RB * Math.sin(a) + 3.5}
          text-anchor="middle"
          font-size="9.5"
          font-weight="700"
          class="fill-accent-fg">{Math.round((d.hits / d.attempts) * 100)}</text
        >
      {/if}
      <text
        x={C + 1.14 * RB * Math.cos(a)}
        y={C - 1.14 * RB * Math.sin(a) + 4}
        text-anchor="middle"
        font-size="12"
        font-weight="600"
        class={d ? 'fill-text' : 'fill-text-faint'}>{n}</text
      >
    {/each}
    <circle cx={C} cy={C} r={R.bull25 * RB} style:fill={fill(bull)} class="stroke-bg"><title>{title('Bull', bull)}</title></circle>
  </svg>
  <div class="flex items-center gap-2 text-[11px] text-text-dim">
    <span>0%</span>
    <span class="h-2 w-24 rounded-full bg-gradient-to-r from-line-3 to-accent"></span>
    <span>55%+</span>
    <span class="ml-2 h-2.5 w-2.5 rounded-[3px] border border-line-2 bg-surface-1"></span>
    <span>not tried</span>
  </div>
</div>
