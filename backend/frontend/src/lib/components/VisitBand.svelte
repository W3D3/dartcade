<script lang="ts">
  // The visit sum under the board (or a compact tile beside the slots), with the
  // VisitFX celebrations: ton plus, maximum, and a tick for a big dart. The sum rolls (ScoreCount).
  import RollingNumber from './RollingNumber.svelte'
  import { shouldReplay, type BandData } from '$lib/visitBand.js'

  let {
    band,
    compact = false,
    visit = 0,
  }: {
    band: BandData
    compact?: boolean
    /** Changes with every new visit: the sum starts over at 0 without rolling. */
    visit?: string | number
  } = $props()

  const tone = $derived(band.bust ? 'bust' : band.fx)
  // Replay the celebration only when a celebrating sum goes up: not on load, not when a dart
  // is undone. Each animated element restarts in place (finished animations included), so the
  // rolling sum stays mounted and keeps turning.
  let boxEl: HTMLDivElement | undefined = $state()
  let lastSum: number | null = null
  $effect(() => {
    if (shouldReplay(lastSum, band)) replay()
    lastSum = Number(band.sum.replace('+', ''))
  })
  function replay() {
    if (!boxEl) return
    const els = [boxEl, ...boxEl.querySelectorAll<HTMLElement>('.sum, .fx-tick, .confetti')]
    for (const el of els) el.style.animation = 'none'
    boxEl.getBoundingClientRect() // a reflow, so the animations start over
    for (const el of els) el.style.animation = ''
  }

  const CONFETTI = ['#e9dfc4', '#c6f24e', '#d23b36', '#1e7a4f', '#dcff7a', '#efeee6']
  // Scattered all round the sum, mostly upwards, each a moment apart (as on the canvas)
  const confetti = Array.from({ length: 34 }, (_, i) => ({
    c: CONFETTI[i % CONFETTI.length],
    w: 6 + ((i * 7) % 5),
    h: 10 + ((i * 5) % 7),
    x: Math.round(Math.cos(i * 2.4) * (70 + ((i * 37) % 240))),
    y: Math.round(Math.sin(i * 2.4) * (60 + ((i * 53) % 150)) - 40),
    r: ((i * 97) % 960) - 540,
    d: ((i * 7) % 17) / 100,
  }))

  const box = $derived(
    tone === 'max'
      ? 'bg-accent border-2 border-accent text-accent-fg fx-max'
      : tone === 'ton'
        ? 'bg-[#1f2618] border-2 border-accent fx-ton'
        : tone === 'bust'
          ? 'bg-surface-panel border border-danger-line'
          : 'bg-surface-panel border border-line-2',
  )
  const eyebrowColor = $derived(tone === 'max' ? '' : tone === 'bust' ? 'text-danger-text font-bold' : 'text-text-muted')
  const sumColor = $derived(tone === 'ton' ? 'text-accent' : tone === 'bust' ? 'text-danger-text line-through' : '')
</script>

<!-- The canvas' card (Match, Tablet-Match, VisitFX): the label at the left edge, the total centred.
     The tile beside the slots (phone, portrait, solo) is as wide as its container allows: wide enough, the label
     goes left of the total in two lines (Match-Vertical); narrower (320px phone), above it. -->
<div
  bind:this={boxEl}
  role="status"
  aria-label="{band.eyebrow}: {band.sum}"
  class="relative rounded-lg md:rounded-card {compact
    ? '@container h-[58px] md:h-[min(124px,14vh)] box-border'
    : 'px-[14px] md:px-4 xl:px-[18px] py-1 md:py-2 xl:py-[10px]'} {box}"
>
  <div
    class="flex items-center {compact
      ? 'size-full flex-col justify-center px-1 @min-[190px]:flex-row @min-[190px]:justify-between @min-[190px]:gap-1 @min-[190px]:px-4'
      : 'justify-center'}"
  >
    <span
      class="uppercase leading-tight {compact
        ? 'max-w-full truncate text-[8px] md:text-[13px] font-semibold tracking-wordmark @min-[190px]:w-min @min-[190px]:overflow-visible @min-[190px]:whitespace-normal @min-[190px]:text-[12px] @min-[190px]:tracking-[0.14em] @min-[260px]:text-[14px]'
        : 'absolute left-[14px] md:left-4 xl:left-5 top-1/2 -translate-y-1/2 text-[11px] md:text-[12px] xl:text-[14px] tracking-[0.1em]'} {eyebrowColor}"
      >{band.eyebrow}</span
    >
    <span
      class="sum font-display font-bold leading-[0.85] -tracking-hero tabular-nums {compact
        ? 'text-[28px] md:text-[80px] @min-[190px]:md:text-[64px] @min-[260px]:md:text-[80px]'
        : 'text-[48px] md:text-[72px] xl:text-[min(96px,11vh)]'} {sumColor}"
      class:fx-tick={band.bigDart}>{@render sum()}</span
    >
  </div>
  {#if tone === 'max'}{@render burst()}{/if}
</div>

<!-- A bust's sum is struck through, which doesn't reach into the wheels: it stands still -->
{#snippet sum()}{#if band.bust}{band.sum}{:else}<RollingNumber value={band.sum} normal="up" reset={visit} />{/if}{/snippet}

{#snippet burst()}
  <span class="absolute inset-0 pointer-events-none" aria-hidden="true">
    {#each confetti as p, i (i)}
      <span class="confetti" style="--c:{p.c};--w:{p.w}px;--h:{p.h}px;--x:{p.x}px;--y:{p.y}px;--r:{p.r}deg;animation-delay:{p.d}s"></span>
    {/each}
  </span>
{/snippet}

<style>
  .fx-ton {
    animation: dc-ton 1.6s ease-in-out 1;
  }
  .fx-ton .sum {
    animation: dc-num 1.6s ease-in-out 1;
  }
  .fx-max {
    animation: dc-max 2.6s cubic-bezier(0.2, 0.8, 0.2, 1) 1;
  }
  .fx-tick {
    animation: dc-tick 0.9s ease-out 1;
  }
  .confetti {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--w);
    height: var(--h);
    background: var(--c);
    border-radius: 2px;
    opacity: 0;
    animation: dc-conf 2.6s cubic-bezier(0.15, 0.7, 0.3, 1) 1 forwards;
  }
  @keyframes dc-ton {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(198, 242, 78, 0);
    }
    50% {
      box-shadow:
        0 0 0 8px rgba(198, 242, 78, 0.16),
        0 0 36px rgba(198, 242, 78, 0.25);
      border-color: var(--color-accent-hover);
    }
  }
  @keyframes dc-num {
    50% {
      transform: scale(1.05);
    }
  }
  @keyframes dc-max {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(198, 242, 78, 0.7);
    }
    10% {
      transform: scale(1.07);
      box-shadow:
        0 0 0 14px rgba(198, 242, 78, 0.45),
        0 0 80px rgba(198, 242, 78, 0.6);
    }
    22% {
      transform: scale(0.99);
    }
    32% {
      transform: scale(1.04);
      box-shadow:
        0 0 0 22px rgba(198, 242, 78, 0.12),
        0 0 60px rgba(198, 242, 78, 0.4);
    }
    50%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(198, 242, 78, 0);
    }
  }
  @keyframes dc-tick {
    12% {
      transform: scale(1.12);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes dc-conf {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(0deg);
    }
    6%,
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(var(--r));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-ton,
    .fx-ton .sum,
    .fx-max,
    .fx-tick {
      animation: none;
    }
    .confetti {
      display: none;
    }
  }
</style>
