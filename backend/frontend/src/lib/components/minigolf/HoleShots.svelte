<!--
  A hole's 2D overview: the hole as the match draws it (HoleView: rails, bumpers, heights) with everyone's
  strokes on it in their seat colour, and a caption with each player's score. Shown between holes
  (ScorecardOverlay) and on the match details page.
-->
<script lang="ts">
  import { seatColor } from '$lib/details/chartColors'
  import { toHole, type HoleData } from '$lib/minigolf/match'
  import { bounds } from '$shared/minigolf/geometry'
  import HoleView from './HoleView.svelte'

  let {
    hole,
    paths,
    scores,
    players,
    label,
    height = 'max-h-[300px]',
  }: {
    hole: HoleData
    /** Per seat, every stroke's path. */
    paths: number[][][][]
    scores: (number | null)[]
    players: { name: string }[]
    label: string
    /** The drawing's max height (a Tailwind class). */
    height?: string
  } = $props()

  const shown = $derived(toHole(hole))
  const pts = (p: number[][]) => p.map(q => `${q[0] ?? 0},${q[1] ?? 0}`).join(' ')
  // HoleView fills its box and keeps its own aspect: the box takes the hole's, capped by `height`
  const aspect = $derived.by(() => {
    const b = bounds(shown.outline)
    return `${b.maxX - b.minX + 240} / ${b.maxY - b.minY + 240}`
  })
</script>

<figure class="flex flex-col gap-2" aria-label={label}>
  <div class="{height} w-full overflow-hidden rounded-xl bg-bg-deep" style:aspect-ratio={aspect}>
    <HoleView hole={shown}>
      {#each paths as strokes, seat (seat)}
        {#each strokes as path, k (k)}
          <polyline points={pts(path)} fill="none" stroke={seatColor(seat)} stroke-width="14" stroke-opacity="0.8" stroke-linecap="round" />
        {/each}
      {/each}
    </HoleView>
  </div>
  <figcaption class="flex flex-wrap gap-3 text-[13px]">
    {#each players as p, seat (seat)}
      <span class="flex items-center gap-1">
        <span class="inline-block size-3 rounded-full" style:background={seatColor(seat)}></span>
        {p.name} · {scores[seat] ?? '–'}
      </span>
    {/each}
  </figcaption>
</figure>
