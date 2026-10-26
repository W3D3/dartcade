<!--
  A hole's 2D overview: everyone's strokes on it, drawn in their seat colour, and a caption with
  each player's score. Shown between holes (ScorecardOverlay) and on the match details page.
-->
<script lang="ts">
  import { seatColor } from '$lib/details/chartColors'
  import { bounds } from '$shared/minigolf/geometry'
  import type { Pt } from '$shared/minigolf/types'

  let {
    hole,
    paths,
    scores,
    players,
    label,
    height = 'max-h-[300px]',
  }: {
    hole: { outline: number[][]; cup: { at: number[]; r: number } }
    /** Per seat, every stroke's path. */
    paths: number[][][][]
    scores: (number | null)[]
    players: { name: string }[]
    label: string
    /** The drawing's max height (a Tailwind class). */
    height?: string
  } = $props()

  const pt = (p: number[]): Pt => [p[0] ?? 0, p[1] ?? 0]
  const pts = (p: number[][]) => p.map(q => `${q[0] ?? 0},${q[1] ?? 0}`).join(' ')
  const viewBox = $derived.by(() => {
    const b = bounds(hole.outline.map(pt))
    return `${b.minX - 80} ${b.minY - 80} ${b.maxX - b.minX + 160} ${b.maxY - b.minY + 160}`
  })
</script>

<figure class="m-0 flex flex-col gap-2">
  <svg {viewBox} class="{height} w-full rounded-xl bg-bg-deep" role="img" aria-label={label}>
    <polygon points={pts(hole.outline)} fill="#2a7045" stroke="#e9dfc4" stroke-width="20" stroke-linejoin="round" />
    <circle cx={hole.cup.at[0]} cy={hole.cup.at[1]} r={hole.cup.r} fill="#050604" />
    {#each paths as strokes, seat (seat)}
      {#each strokes as path, k (k)}
        <polyline points={pts(path)} fill="none" stroke={seatColor(seat)} stroke-width="14" stroke-opacity="0.8" stroke-linecap="round" />
      {/each}
    {/each}
  </svg>
  <figcaption class="flex flex-wrap gap-3 text-[13px]">
    {#each players as p, seat (seat)}
      <span class="flex items-center gap-1">
        <span class="inline-block size-3 rounded-full" style:background={seatColor(seat)}></span>
        {p.name} · {scores[seat] ?? '–'}
      </span>
    {/each}
  </figcaption>
</figure>
