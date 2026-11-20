<script lang="ts">
  // The screen after the win screen when the game unlocked or levelled up achievements of yours:
  // one card per achievement, as the Badge-Unlock board's toast (the badge pops in with a ring,
  // confetti and a sheen on the rim, the text rises, the bar grows to the count, the new tier flips
  // in), one after another. Reduced motion: everything just appears.
  import Badge from './Badge.svelte'
  import XpChip from './XpChip.svelte'
  import WinFooterButton from '$lib/components/WinFooterButton.svelte'
  import { TIER_TONE } from '$lib/achievements/view'
  import type { UnlockView } from '$lib/achievements/toasts'
  import type { WinButton } from '$lib/winScreen'

  let {
    unlocks,
    primary,
    secondary = null,
  }: {
    unlocks: UnlockView[]
    /** The win screen's own buttons, moved here: Rematch, Back to lobby, Back to Play, … */
    primary: WinButton
    secondary?: WinButton | null
  } = $props()

  const totalXp = $derived(unlocks.reduce((a, u) => a + u.xp, 0))
  // The board's confetti: where each piece flies to and its colour
  const BURST = [
    [69, -5],
    [58, 32],
    [47, 61],
    [32, 76],
    [-3, 80],
    [-32, 59],
    [-83, 43],
    [-71, 11],
    [-86, -47],
    [-47, -63],
    [-2, -66],
    [27, -69],
    [34, -59],
    [81, -47],
  ]
  const BURST_COLORS = ['var(--color-accent)', '#f2b94e', '#9ec8ff', '#ff8a80', 'var(--color-text)']
  const pct = (n: number, of: number) => `${Math.min(100, (n / of) * 100)}%`
</script>

<div class="unlocks flex flex-1 min-h-0 flex-col">
  <main class="flex-1 min-h-0 overflow-y-auto box-border flex flex-col items-center gap-6 px-4 py-8 md:px-7 md:py-12">
    <header class="head flex flex-col items-center gap-2 text-center">
      <span class="text-caption label-caps text-accent">From this game</span>
      <h1 class="type-checkout uppercase md:text-page-title tracking-title">
        {unlocks.length === 1 ? 'Achievement unlocked' : `${unlocks.length} achievements`}
      </h1>
      {#if unlocks.length > 1}<XpChip xp={totalXp} tone="var(--color-accent)" />{/if}
    </header>
    <ul class="flex w-full max-w-[580px] flex-col gap-4">
      {#each unlocks as u, i (u.badge.def.id)}
        {@const tone = TIER_TONE[u.badge.tier]}
        <li
          class="card box-border flex flex-col gap-[14px] rounded-popover border bg-surface-2 px-5 py-[18px] shadow-[0_22px_50px_-12px_rgba(0,0,0,0.75)]"
          style="border-color: {tone}; --i: {i}"
        >
          <div class="flex items-center gap-4 md:gap-5">
            <span class="relative block size-24 shrink-0">
              <span class="halo absolute inset-1 rounded-full border-2" style="border-color: {tone}"></span>
              {#each BURST as [x, y], j (j)}
                <span
                  aria-hidden="true"
                  class="burst absolute left-1/2 top-1/2 rounded-bar {j % 2 ? 'h-[10px] w-1' : 'h-1 w-[7px]'}"
                  style="background: {BURST_COLORS[j % BURST_COLORS.length]}; --x: {x}px; --y: {y}px"
                ></span>
              {/each}
              <span class="pop absolute inset-0 block"><Badge badge={u.badge} size={96} /></span>
              <span aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
                <span class="sheen absolute -top-1/5 h-[140%] w-[30%] rotate-20"></span>
              </span>
            </span>
            <div class="rise flex min-w-0 flex-1 flex-col gap-1">
              <span class="text-caption label-caps" style="color: {tone}">{u.kicker}</span>
              <span class="type-section-title md:text-card-title leading-none tracking-hero">{u.badge.def.name}</span>
              <span class="text-small text-text-muted"
                >{u.badge.def.description}{u.badge.oneOff ? '' : ` Tier ${u.badge.tier} of ${u.badge.def.thresholds.length}.`}</span
              >
            </div>
            <span class="rise max-md:hidden"><XpChip xp={u.xp} {tone} /></span>
          </div>
          {#if u.tierUp}
            <div class="rise flex items-center gap-[10px] text-label text-text-muted">
              <span>{u.tierUp.from}</span>
              <span aria-hidden="true" class="text-text-dim">→</span>
              <span class="flip inline-block font-semibold" style="color: {tone}">{u.tierUp.to}</span>
              <span class="ml-auto md:hidden"><XpChip xp={u.xp} {tone} /></span>
            </div>
          {:else}
            <span class="rise self-start md:hidden"><XpChip xp={u.xp} {tone} /></span>
          {/if}
          {#if u.next}
            <div class="rise flex flex-col gap-[6px]">
              <div class="flex justify-between gap-3 text-label text-text-muted">
                <span>{u.next.label}</span>
                <span
                  ><b class="text-text">{u.next.count.toLocaleString('en-GB')}</b> of {u.next.target.toLocaleString('en-GB')}
                  {u.next.unit}</span
                >
              </div>
              <span class="block h-2 overflow-hidden rounded-[4px] bg-surface-chip">
                <span
                  class="bar block h-full rounded-[4px]"
                  style="--w: {pct(u.next.count, u.next.target)}; width: var(--w); background: linear-gradient(90deg, {tone}, #fff3bf)"
                ></span>
              </span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </main>
  <footer
    class="shrink-0 box-border flex items-center gap-3 px-4 md:px-7 pt-[18px] pb-[calc(18px+env(safe-area-inset-bottom))] border-t border-line bg-surface-1"
  >
    {#if secondary}<WinFooterButton button={secondary} class="ml-auto" />{/if}
    <WinFooterButton button={primary} main class={secondary ? '' : 'ml-auto'} />
  </footer>
</div>

<style>
  .unlocks {
    background: radial-gradient(900px 520px at 50% 18%, #1e2416 0%, var(--color-bg) 70%);
  }
  /* The board's 6 s loop played once over 3.6 s; each card starts 0.5 s after the one before */
  .card {
    --at: calc(var(--i) * 0.5s);
  }
  .head {
    animation: rise 1.2s ease both;
  }
  .pop {
    animation: pop 3.6s ease var(--at) both;
  }
  .halo {
    animation: ring 3.6s ease-out var(--at) both;
  }
  .burst {
    animation: burst 3.6s ease-out var(--at) both;
  }
  .sheen {
    left: -65%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
    animation: sheen 3.6s ease var(--at) both;
  }
  .rise {
    animation: rise 3.6s ease var(--at) both;
  }
  .bar {
    animation: grow 3.6s ease var(--at) both;
  }
  .flip {
    animation: flip 3.6s ease var(--at) both;
  }
  @keyframes pop {
    0%,
    10% {
      transform: scale(0) rotate(-30deg);
    }
    33% {
      transform: scale(1.18) rotate(6deg);
    }
    50%,
    100% {
      transform: scale(1) rotate(0);
    }
  }
  @keyframes ring {
    0%,
    23% {
      transform: scale(1);
      opacity: 0;
    }
    30% {
      opacity: 0.7;
    }
    92%,
    100% {
      transform: scale(1.9);
      opacity: 0;
    }
  }
  @keyframes burst {
    0%,
    20% {
      transform: translate(0, 0) scale(0.4);
      opacity: 0;
    }
    27% {
      opacity: 1;
    }
    83%,
    100% {
      transform: translate(var(--x), var(--y)) scale(1) rotate(220deg);
      opacity: 0;
    }
  }
  @keyframes sheen {
    0%,
    50% {
      left: -65%;
    }
    92%,
    100% {
      left: 135%;
    }
  }
  @keyframes rise {
    0%,
    30% {
      transform: translateY(8px);
      opacity: 0;
    }
    47%,
    100% {
      transform: none;
      opacity: 1;
    }
  }
  @keyframes grow {
    0%,
    50% {
      width: 0;
    }
    100% {
      width: var(--w);
    }
  }
  @keyframes flip {
    0%,
    57% {
      transform: rotateX(0);
    }
    73% {
      transform: rotateX(90deg);
    }
    90%,
    100% {
      transform: rotateX(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .unlocks * {
      animation: none !important;
    }
    .halo,
    .burst {
      opacity: 0;
    }
  }
</style>
