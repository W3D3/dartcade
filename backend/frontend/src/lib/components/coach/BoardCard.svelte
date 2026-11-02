<script lang="ts">
  // A visit on the board (Coach-Leg's selected visit, the sandbox): the details' muted board, the
  // better aim's bed in blue with its likely misses labelled, and each dart as a pin with its
  // name. A dart without a position sits hollow at its bed's centre; the selected one is lime
  // with a pulsing ring.
  import type { ReviewDart } from '$shared/coach'
  import { aimBed, bedCentre, type BoardTag } from '$lib/coach/view'
  import { clampToView, toBoardPx } from '$lib/details/heatmap'
  import { bedPath } from '$lib/details/boardGeometry'
  import MutedBoard from '$lib/components/details/MutedBoard.svelte'

  let {
    darts,
    selected = null,
    better = null,
    misses = [],
    onpoint,
  }: {
    darts: ReviewDart[]
    /** Index into `darts` */
    selected?: number | null
    /** The better aim (CoachNote.betterAimId, CoachNote.better) */
    better?: { aimId: string; label: string } | null
    /** Where a dart at the better aim likely lands instead (likelyMisses) */
    misses?: BoardTag[]
    /** A click's board point, in board units */
    onpoint?: (p: { x: number; y: number }) => void
  } = $props()

  const pins = $derived(
    darts.flatMap((d, i) => {
      const at = d.coords ?? bedCentre(d.name)
      return at ? [{ i, name: d.name, hollow: !d.coords, ...clampToView(toBoardPx(at)) }] : []
    }),
  )
  const missTags = $derived(misses.map(m => ({ name: m.label, ...toBoardPx(m) })))
  const bed = $derived(better ? aimBed(better.aimId) : null)
  const label = $derived(
    `${darts.map(d => d.name).join(', ') || 'No darts'}${better ? `; ${better.label} highlighted as the better target` : ''}`,
  )

  /** A name tag's width and where it sits: up and right of the pin, left of it near the right edge. */
  const tagW = (name: string) => name.length * 11 + 14
  const tagX = (p: { x: number; name: string }) => (p.x > 120 ? p.x - 16 - tagW(p.name) : p.x + 16)
</script>

<MutedBoard {label} {onpoint} class="block w-full max-w-[300px] aspect-square mx-auto">
  {#if bed}<path d={bedPath(bed)} fill-rule="evenodd" class="fill-ice stroke-text" stroke-width="2" />{/if}

  {#each missTags as m, i (i)}
    <g transform="translate({m.x - tagW(m.name) / 2} {m.y})">
      <rect y="-13" width={tagW(m.name)} height="26" rx="7" class="fill-bg stroke-ice" stroke-width="2" />
      <text
        x={tagW(m.name) / 2}
        y="1"
        text-anchor="middle"
        dominant-baseline="central"
        class="fill-ice"
        font-size="20"
        font-family="Barlow Condensed, sans-serif"
        font-weight="700"
      >
        {m.name}
      </text>
    </g>
  {/each}

  {#each pins as p (p.i)}
    {@const sel = p.i === selected}
    <circle
      cx={p.x}
      cy={p.y}
      r={sel ? 11 : 9}
      class="{p.hollow ? 'fill-bg' : sel ? 'fill-accent' : 'fill-text'} {p.hollow ? (sel ? 'stroke-accent' : 'stroke-text') : 'stroke-bg'}"
      stroke-width="3"
    />
    {#if sel}<circle cx={p.x} cy={p.y} r="11" fill="none" class="ping stroke-accent" stroke-width="3" />{/if}
    <g transform="translate({tagX(p)} {p.y - 16})">
      <rect
        y="-15"
        width={tagW(p.name)}
        height="30"
        rx="7"
        class="fill-bg {sel ? 'stroke-accent' : 'stroke-line-strong'}"
        stroke-width="2"
      />
      <text
        x={tagW(p.name) / 2}
        y="1"
        text-anchor="middle"
        dominant-baseline="central"
        class={sel ? 'fill-accent' : 'fill-text'}
        font-size="22"
        font-family="Barlow Condensed, sans-serif"
        font-weight="700">{p.name}</text
      >
    </g>
  {/each}
</MutedBoard>

<style>
  .ping {
    transform-box: fill-box;
    transform-origin: center;
    animation: ping 1.6s ease-out infinite;
  }
  @keyframes ping {
    from {
      transform: scale(1);
      opacity: 0.9;
    }
    to {
      transform: scale(2.2);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ping {
      animation: none;
    }
  }
</style>
