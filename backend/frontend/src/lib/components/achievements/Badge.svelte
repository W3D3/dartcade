<script lang="ts">
  import { THEME } from '$lib/theme'
  // One achievement badge (Badges board): the same picture in every tier with a rim that climbs
  // Dark, Silver, Gold, Platinum, Dartcade; dots on top count the tier and a pill shows the count the
  // tier took. A one-off keeps the dark rim with no dots or pill. Not earned: greyed with a lock. With
  // `fraction` a ring round the badge fills towards the next tier. Below 44 px the pill is left out.
  import { GLYPHS } from '$lib/achievements/glyphs'
  import { type Badge } from '$lib/achievements/view'

  let { badge, size = 96, fraction = false, label = true }: { badge: Badge; size?: number; fraction?: boolean; label?: boolean } = $props()

  const locked = $derived(badge.tier === 0)
  // A locked badge shows the first tier's rim
  const rim = $derived(badge.oneOff ? 0 : Math.max(1, badge.tier))
  const pill = $derived(
    !badge.oneOff && !locked && size >= 44 ? `×${badge.def.thresholds[badge.tier - 1].toLocaleString('en-GB').replace(/,/g, '')}` : null,
  )
  const pillWidth = $derived(pill ? Math.max(30, 14 + 5.9 * pill.length) : 0)
  const PILL_TEXT = ['', THEME.accent, '#14171b', '#2a1d05', '#0b2a32', '#14210a']
  // Dots along the top of the rim, 11° apart, centred
  const dots = $derived(
    badge.oneOff || locked
      ? []
      : Array.from({ length: badge.tier }, (_, i) => {
          const a = ((i - (badge.tier - 1) / 2) * 11 * Math.PI) / 180
          return { x: 60 + 47.5 * Math.sin(a), y: 60 - 47.5 * Math.cos(a) }
        }),
  )
  const CIRC = 2 * Math.PI * 58.5
  const name = $derived(label ? `${badge.def.name}${badge.oneOff ? '' : badge.tier ? `, tier ${badge.tier}` : ', not earned yet'}` : '')
</script>

<svg
  viewBox={fraction ? '-2 -2 124 124' : '0 0 120 120'}
  width={size}
  height={size}
  role={label ? 'img' : undefined}
  aria-label={label ? name : undefined}
  aria-hidden={label ? undefined : true}
  class="block shrink-0 overflow-visible"
>
  {#if fraction}
    <circle cx="60" cy="60" r="58.5" fill="none" stroke="#2a2d27" stroke-width="3" />
    <circle
      cx="60"
      cy="60"
      r="58.5"
      fill="none"
      stroke={THEME.accent}
      stroke-width="3"
      stroke-linecap="round"
      stroke-dasharray="{CIRC * badge.fraction} {CIRC}"
      transform="rotate(-90 60 60)"
    />
  {/if}
  <g style={locked ? 'filter:grayscale(1) brightness(.45) contrast(.9)' : undefined}>
    <circle cx="60" cy="60" r="53" fill="url(#bm{rim})" />
    <circle cx="60" cy="60" r="51.6" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1" />
    <circle cx="60" cy="60" r="42" fill="url(#bfield)" stroke="#0b0c0a" stroke-opacity=".7" stroke-width="2" />
    {#each dots as d, i (i)}<circle cx={d.x} cy={d.y} r="2" fill="#0b0c0a" opacity=".55" />{/each}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- the design's own static art -->
    {@html GLYPHS[badge.def.id]}
    {#if pill}
      <rect
        x={60 - pillWidth / 2}
        y="88"
        width={pillWidth}
        height="16"
        rx="8"
        fill="url(#bm{rim})"
        stroke="#0b0c0a"
        stroke-opacity=".55"
        stroke-width="1.5"
      />
      <text
        x="60"
        y="100.3"
        text-anchor="middle"
        font-family="Barlow Condensed, sans-serif"
        font-weight="700"
        font-size="13"
        fill={PILL_TEXT[rim]}>{pill}</text
      >
    {/if}
  </g>
  {#if locked}
    <g transform="translate(60 60)">
      <circle r="13" fill={THEME.bg} stroke="#65685f" stroke-width="1.5" />
      <rect x="-6" y="-2" width="12" height="9" rx="2" fill="#a3a498" />
      <path d="M-3.8 -2v-3a3.8 3.8 0 0 1 7.6 0v3" fill="none" stroke="#a3a498" stroke-width="2" />
    </g>
  {/if}
</svg>
