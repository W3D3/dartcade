<script lang="ts">
  // A visit on the board (Coach-Leg's selected visit, the sandbox): the details' muted board, the
  // better aim's bed in blue with its likely misses labelled, and each dart as a pin with its
  // name. A dart without a position sits hollow at its bed's centre; the selected one is lime
  // with a pulsing ring. A faint line joins each dart to the target its class picked.
  import type { ReviewDart } from '$shared/coach'
  import { aimBed, aimPoint, type BoardTag } from '$lib/coach/view'
  import { BOARD_VIEW_HALF, clampToView, toBoardPx } from '$lib/details/heatmap'
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
      const at = d.coords ?? (d.bedAimId === null ? null : aimPoint(d.bedAimId))
      return at ? [{ i, name: d.name, hollow: !d.coords, ...clampToView(toBoardPx(at)) }] : []
    }),
  )
  const lines = $derived(
    pins.flatMap(p => {
      const aim = darts[p.i].class.target
      const to = aim ? aimPoint(aim.aimId) : null
      return to ? [{ i: p.i, x1: p.x, y1: p.y, ...toBoardPx(to) }] : []
    }),
  )
  // Centred on the miss, kept inside the board's box (a tag can carry what the miss leaves: "S8 · 8 = D4")
  const missTags = $derived(
    misses.map(m => {
      const p = toBoardPx(m)
      const w = tagW(m.label)
      return { name: m.label, x: Math.min(Math.max(p.x - w / 2, -BOARD_VIEW_HALF), BOARD_VIEW_HALF - w), y: p.y }
    }),
  )
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
    <g transform="translate({m.x} {m.y})">
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

  <g aria-hidden="true" class="stroke-text" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round" opacity="0.45">
    {#each lines as l (l.i)}<line x1={l.x1} y1={l.y1} x2={l.x} y2={l.y} />{/each}
  </g>

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
