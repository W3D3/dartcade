<script lang="ts">
  import { labelPos } from '$lib/dartUtils.js'

  let { darts = [], selectedSegments = [], playerMarkers = [], checkoutTargets = [] }: {
    darts?: Array<{
      segment: { number: number; bed: string; multiplier: number; name: string }
      score: number
      coords?: { x: number; y: number }
    }>
    selectedSegments?: number[]
    playerMarkers?: Array<{ initial: string; segment: number; isActive: boolean }>
    checkoutTargets?: string[]
  } = $props()

  const R = { bull50: 0.037, bull25: 0.094, si: 0.582, tr: 0.629, so: 0.953, db: 1.000 }
  const SEGS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5]
  const HALF = Math.PI / 20

  function segAngle(i: number) { return Math.PI / 2 - i * 2 * HALF }

  function sectorPath(r1: number, r2: number, a1: number, a2: number) {
    const [c1,s1,c2,s2] = [Math.cos(a1),Math.sin(a1),Math.cos(a2),Math.sin(a2)]
    return `M${r1*c1} ${-r1*s1} L${r2*c1} ${-r2*s1} A${r2} ${r2} 0 0 1 ${r2*c2} ${-r2*s2} L${r1*c2} ${-r1*s2} A${r1} ${r1} 0 0 0 ${r1*c1} ${-r1*s1}Z`
  }

  function ringColor(i: number, ring: string) {
    const ev = i % 2 === 0
    if (ring === 'tr' || ring === 'db') return ev ? '#d23b36' : '#1e7a4f'
    return ev ? '#1a1a17' : '#e9dfc4'
  }

  const sectors = SEGS.map((num, i) => {
    const c = segAngle(i), a1 = c + HALF, a2 = c - HALF
    return {
      num, i, a1, a2,
      paths: [
        { ring: 'si', d: sectorPath(R.bull25, R.si, a1, a2) },
        { ring: 'tr', d: sectorPath(R.si, R.tr, a1, a2) },
        { ring: 'so', d: sectorPath(R.tr, R.so, a1, a2) },
        { ring: 'db', d: sectorPath(R.so, R.db, a1, a2) },
      ],
      tx: Math.cos(c) * 1.06,
      ty: -Math.sin(c) * 1.06,
      wa: c + HALF,
    }
  })

  function dartPos(dart: typeof darts[0]): { x: number; y: number } | null {
    if (dart.coords) return dart.coords
    const { bed, number } = dart.segment
    if (bed === 'Outside') return null
    if (number === 25) return { x: 0, y: (R.bull50 + R.bull25) / 2 }
    if (number === 50) return { x: 0, y: R.bull50 / 2 }
    const si = SEGS.indexOf(number)
    if (si < 0) return null
    const a = segAngle(si)
    const r = bed === 'SingleInner' ? (R.bull25 + R.si) / 2
            : bed === 'Triple'      ? (R.si + R.tr) / 2
            : bed === 'Double'      ? (R.so + R.db) / 2
            :                         (R.tr + R.so) / 2
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  }

  function markerPos(segNum: number): { x: number; y: number } | null {
    if (segNum === 25 || segNum === 50) return { x: 0, y: 0 }
    const si = SEGS.indexOf(segNum)
    if (si < 0) return null
    const a = segAngle(si)
    const r = (R.tr + R.so) / 2
    return { x: r * Math.cos(a), y: -r * Math.sin(a) }
  }

  const DOT_COLORS = ['#c6f24e', '#c6f24e', '#c6f24e']
  const DOT_STROKE = '#0f100e'
</script>

<svg viewBox="-1.15 -1.15 2.3 2.3" class="w-full" xmlns="http://www.w3.org/2000/svg">
  <circle cx="0" cy="0" r="1.12" fill="#0a0b09" />

  <!-- Sector fills and wire dividers — all at full opacity -->
  {#each sectors as { num, i, paths, wa }}
    {#each paths as { ring, d }}
      <path {d} fill={ringColor(i, ring)} stroke="#8d8e84" stroke-width="0.005" />
    {/each}
    <line
      x1={R.bull25 * Math.cos(wa)} y1={-R.bull25 * Math.sin(wa)}
      x2={R.db * Math.cos(wa)} y2={-R.db * Math.sin(wa)}
      stroke="#8d8e84" stroke-width="0.006"
    />
  {/each}

  <!-- Ring wire circles -->
  {#each [R.bull25, R.si, R.tr, R.so, R.db] as r}
    <circle cx="0" cy="0" {r} fill="none" stroke="#8d8e84" stroke-width="0.006" />
  {/each}

  <!-- Bull fills -->
  <circle cx="0" cy="0" r={R.bull25} fill="#1e7a4f" stroke="#8d8e84" stroke-width="0.006" />
  <circle cx="0" cy="0" r={R.bull50} fill="#d23b36" stroke="#8d8e84" stroke-width="0.006" />

  <!-- Selected segment: lime wedge overlay -->
  {#each sectors as { num, a1, a2 }}
    {#if selectedSegments.includes(num)}
      <path d={sectorPath(R.bull25, R.db, a1, a2)}
        fill="#c6f24e" fill-opacity="0.22"
        stroke="#c6f24e" stroke-width="0.016" stroke-linejoin="round" />
    {/if}
  {/each}

  <!-- Selected bull overlays -->
  {#if selectedSegments.includes(25)}
    <circle cx="0" cy="0" r={R.bull25}
      fill="#c6f24e" fill-opacity="0.28" stroke="#c6f24e" stroke-width="0.016" />
  {/if}
  {#if selectedSegments.includes(50)}
    <circle cx="0" cy="0" r={R.bull50}
      fill="#c6f24e" fill-opacity="0.45" stroke="#c6f24e" stroke-width="0.016" />
  {/if}

  <!-- Number labels on top of overlay — lime for selected segment -->
  {#each sectors as { num, tx, ty }}
    <text x={tx} y={ty} text-anchor="middle" dominant-baseline="central"
      fill={selectedSegments.includes(num) ? '#c6f24e' : '#efeee6'}
      font-size={selectedSegments.includes(num) ? '0.105' : '0.09'}
      font-family="Barlow Condensed, sans-serif" font-weight="bold">
      {num}
    </text>
  {/each}

  <!-- Other-player markers: white circle with initial -->
  {#each playerMarkers.filter(m => !m.isActive) as marker}
    {@const pos = markerPos(marker.segment)}
    {#if pos}
      <circle cx={pos.x} cy={pos.y} r="0.085"
        fill="white" stroke="#0a0b09" stroke-width="0.01" />
      <text x={pos.x} y={pos.y} text-anchor="middle" dominant-baseline="central"
        fill="#0a0b09" font-size="0.072" font-family="Barlow Condensed, sans-serif" font-weight="bold">
        {marker.initial}
      </text>
    {/if}
  {/each}

  <!-- Darts -->
  {#each darts as dart, i}
    {@const pos = dartPos(dart)}
    {#if pos}
      <circle cx={pos.x} cy={-pos.y} r="0.04"
        fill={DOT_COLORS[i % DOT_COLORS.length]} stroke={DOT_STROKE} stroke-width="0.008" />
      <text x={pos.x + 0.05} y={-pos.y} dominant-baseline="central"
        fill="#ffe066" font-size="0.065" font-family="system-ui,sans-serif" font-weight="bold">
        {dart.segment.name}
      </text>
    {:else}
      <text x={-0.15 + i * 0.14} y="1.05" text-anchor="middle" dominant-baseline="central"
        fill="#c6f24e" font-size="0.1" font-family="Barlow Condensed, sans-serif">✕</text>
    {/if}
  {/each}

  <!-- Checkout target dashed circles (x01) -->
  {#each checkoutTargets as label}
    {@const pos = labelPos(label)}
    {#if pos}
      <circle cx={pos.x} cy={pos.y} r="0.055"
        fill="none" stroke="#c6f24e" stroke-width="0.018" stroke-dasharray="0.025 0.02" />
    {/if}
  {/each}
</svg>
