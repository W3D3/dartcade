<script lang="ts">
  // Nothing is being played: the clock, the date and the board's name.
  import { onMount } from 'svelte'
  import Wordmark from '$lib/components/Wordmark.svelte'
  import type { Orientation } from '$lib/bigscreen/stage'

  let { name, online, orientation }: { name: string; online: boolean; orientation: Orientation } = $props()
  let now = $state(new Date())
  onMount(() => {
    const t = setInterval(() => (now = new Date()), 1000)
    return () => clearInterval(t)
  })
  const time = $derived(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  // Two slowly counter-rotating dartboard rings behind the clock (the Presenter-Idle design).
  const C = 750
  const pt = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(C + r * Math.cos(a)).toFixed(1)} ${(C + r * Math.sin(a)).toFixed(1)}`
  }
  const segments = (outer: number, inner: number) =>
    Array.from({ length: 20 }, (_, k) => {
      const a = k * 18 - 9
      const b = a + 18
      return `M${pt(inner, a)}L${pt(outer, a)}A${outer} ${outer} 0 0 1 ${pt(outer, b)}L${pt(inner, b)}A${inner} ${inner} 0 0 0 ${pt(inner, a)}Z`
    })
  const outerRing = segments(675, 645)
  const innerRing = segments(465, 412.5)
  const date = $derived(now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }))
</script>

<div class="relative isolate flex size-full flex-col items-center justify-center gap-10 overflow-hidden bg-big-glow text-center">
  <svg
    width="1500"
    height="1500"
    viewBox="0 0 1500 1500"
    aria-hidden="true"
    class="absolute -z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-accent"
  >
    <g class="spin" style="animation-duration: 90s">
      {#each outerRing as d, k (k)}<path {d} fill="currentColor" fill-opacity={k % 2 ? 0.12 : 0.04} />{/each}
      {#each { length: 60 } as _, k (k)}<path
          d="M750 15V45"
          stroke="currentColor"
          stroke-opacity=".25"
          stroke-width="3"
          transform="rotate({k * 6} 750 750)"
        />{/each}
    </g>
    <g class="spin" style="animation-duration: 140s; animation-direction: reverse">
      {#each innerRing as d, k (k)}<path {d} fill="currentColor" fill-opacity={k % 2 ? 0.1 : 0.05} />{/each}
    </g>
    <circle cx="750" cy="750" r="525" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width="2" />
    <circle cx="750" cy="750" r="300" fill="none" stroke="currentColor" stroke-opacity=".06" stroke-width="2" />
  </svg>
  <Wordmark size={64} text="text-[72px]" badge={false} />
  <div class="font-display font-bold leading-none {orientation === 'landscape' ? 'text-[300px]' : 'text-[260px]'}">{time}</div>
  <div class="text-[44px] text-text-muted">{date}</div>
  <div class="font-mono text-[28px] uppercase tracking-[0.2em] text-text-dim">{name}</div>
  <div class="text-[40px] {online ? 'text-accent' : 'text-warn'}">{online ? 'Waiting for the next game' : 'Board offline'}</div>
</div>

<style>
  .spin {
    transform-origin: center;
    transform-box: fill-box;
    animation: spin linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
</style>
