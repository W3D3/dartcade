<script lang="ts">
  // A rank's insignia (Rank insignia board): the shape and colour are the tier, gaining corners as
  // you climb; the numeral is the stage, with ticks filling up towards the next tier. Silver and up
  // get a gradient, Gold and up a shadow and glow that scale with the size, Diamond and Elite a
  // sheen, Elite an inner ring. Under 30 px it is a solid badge with the numeral knocked out. No rank
  // (still placing) is a dashed "?".
  import type { Rank, Tier } from '$shared/ranked.js'
  import { TIER_COLOR } from '$lib/ranked/view'

  let { rank, size = 40 }: { rank: Rank | null; size?: number } = $props()

  /** Per tier, from the board: the gradient's light and dark shade, the fill's top and bottom
   *  opacity at full size, and the glow's blur at 96 px (null: none). */
  const STYLE: Record<Tier, { light: string; dark: string; fill: [number, number] | null; glow: number | null; alpha: string }> = {
    Wood: { light: '', dark: '', fill: null, glow: null, alpha: '' },
    Bronze: { light: '', dark: '', fill: null, glow: null, alpha: '' },
    Silver: { light: '#e7eaed', dark: '#757a7d', fill: [0.3, 0.04], glow: null, alpha: '' },
    Gold: { light: '#f6e4b0', dark: '#877232', fill: [0.42, 0.05], glow: 9, alpha: '40' },
    Diamond: { light: '#c0ebf9', dark: '#477b8b', fill: [0.48, 0.06], glow: 12, alpha: '59' },
    Elite: { light: '#e5f9af', dark: '#748c31', fill: [0.55, 0.08], glow: 15, alpha: '73' },
  }
  const OCTAGON = '67.6,7.5 92.5,32.4 92.5,67.6 67.6,92.5 32.4,92.5 7.5,67.6 7.5,32.4 32.4,7.5'

  const id = $props.id()
  const small = $derived(size < 30)
  const color = $derived(rank ? TIER_COLOR[rank.tier] : '#8f9085')
  const style = $derived(rank ? STYLE[rank.tier] : null)
  const graded = $derived(style?.fill != null)
  const sheen = $derived(rank?.tier === 'Diamond' || rank?.tier === 'Elite')

  // The drop shadow steps down with the size; the glow's blur shrinks with it, to 2 px at least
  const shadow = $derived(
    size >= 80 ? '0 4px 8px' : size >= 60 ? '0 3px 5px' : size >= 32 ? '0 2px 3px' : size >= 20 ? '0 1px 2px' : '0 1px 1px',
  )
  const glowFilter = $derived(
    style?.glow != null
      ? `drop-shadow(${shadow} rgba(0,0,0,0.55)) drop-shadow(0 0 ${Math.max(2, Math.round((size / 96) * style.glow))}px ${color}${style.alpha})`
      : undefined,
  )
  // Diamond's ticks sit higher and closer, inside the narrower bottom point
  const ticks = $derived(rank?.tier === 'Diamond' ? { y: 70, w: 4.4, x0: 34.6, step: 6.6 } : { y: 73, w: 6, x0: 30.6, step: 8.2 })
</script>

{#snippet shape()}
  {#if !rank || rank.tier === 'Wood'}
    <circle cx="50" cy="50" r="44" />
  {:else if rank.tier === 'Bronze'}
    <rect x="9" y="9" width="82" height="82" rx="16" />
  {:else if rank.tier === 'Silver'}
    <polygon points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27" />
  {:else if rank.tier === 'Gold'}
    <path d="M50 6 L88 18 V50 C88 74 72 88 50 95 C28 88 12 74 12 50 V18Z" />
  {:else if rank.tier === 'Diamond'}
    <polygon points="50,1 99,50 50,99 1,50" />
  {:else}
    <polygon points={OCTAGON} />
  {/if}
{/snippet}

<svg
  viewBox="0 0 100 100"
  width={size}
  height={size}
  role="img"
  aria-label={rank ? rank.name : 'Placement'}
  class="block flex-shrink-0 overflow-visible"
  style:filter={glowFilter}
>
  {#if !rank || !style}
    <circle cx="50" cy="50" r="44" fill="none" stroke={color} stroke-width="3.5" stroke-dasharray="8 7" />
    <text x="50" y="64" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="44" fill={color}
      >?</text
    >
  {:else}
    {#if graded}
      <defs>
        <linearGradient id="{id}-f" x1="0" y1="0" x2="0" y2="1">
          {#if small}
            <stop offset="0" stop-color={style.light} />
            <stop offset="0.5" stop-color={color} />
            <stop offset="1" stop-color={style.dark} />
          {:else}
            <stop offset="0" stop-color={color} stop-opacity={style.fill?.[0]} />
            <stop offset="1" stop-color={color} stop-opacity={style.fill?.[1]} />
          {/if}
        </linearGradient>
        <linearGradient id="{id}-s" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stop-color={style.light} />
          <stop offset="0.45" stop-color={color} />
          <stop offset="1" stop-color={style.dark} />
        </linearGradient>
        <clipPath id="{id}-c">{@render shape()}</clipPath>
      </defs>
    {/if}
    <g
      fill={graded ? `url(#${id}-f)` : color}
      fill-opacity={graded || small ? undefined : 0.12}
      stroke={graded ? `url(#${id}-s)` : color}
      stroke-width={small ? 5 : 3.5}
      stroke-linejoin="round">{@render shape()}</g
    >
    {#if sheen}
      <polygon clip-path="url(#{id}-c)" points="0,0 100,0 0,62" fill="#ffffff" fill-opacity={small ? 0.1 : 0.08} />
    {/if}
    {#if rank.tier === 'Elite'}
      {#if small}
        <polygon
          points="64.5,14.9 85.1,35.5 85.1,64.5 64.5,85.1 35.5,85.1 14.9,64.5 14.9,35.5 35.5,14.9"
          fill="none"
          stroke="#0f100e"
          stroke-width="4"
          stroke-linejoin="round"
        />
      {:else}
        <polygon
          points="64.9,14 86,35.1 86,64.9 64.9,86 35.1,86 14,64.9 14,35.1 35.1,14"
          fill="none"
          stroke={color}
          stroke-opacity="0.5"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      {/if}
    {/if}
    {#if small}
      <text x="50" y="65" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="44" fill="#0f100e"
        >{rank.numeral}</text
      >
    {:else}
      <text
        x="50"
        y={rank.tier === 'Diamond' ? 59 : 60}
        text-anchor="middle"
        font-family="Barlow Condensed, sans-serif"
        font-weight="700"
        font-size={rank.stage >= 4 ? 40 : 44}
        letter-spacing="0.5"
        fill={sheen ? style.light : color}>{rank.numeral}</text
      >
      {#each [0, 1, 2, 3, 4] as i (i)}
        <rect
          x={ticks.x0 + i * ticks.step}
          y={ticks.y}
          width={ticks.w}
          height="3.5"
          rx="1.75"
          fill={color}
          fill-opacity={i < rank.stage ? 1 : 0.22}
        />
      {/each}
    {/if}
  {/if}
</svg>
