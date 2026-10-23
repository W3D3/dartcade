<script lang="ts">
  // One challenge (Progress board), in one of three states. Going: the title with a Hard pill, "9 of
  // 15" under it, "1 to go" when it's nearly there, its XP, and a striped bar. Finished: highlighted,
  // "Complete", and a Claim button that pays its XP. Claimed: muted, "Claimed", the XP greyed. Motion
  // only for what happens while you look: the bar slides when progress moves, and a challenge you
  // just finished (`fresh`) stamps its check in with a small burst. An unfinished daily can be
  // rerolled once a day.
  import { Check, LoaderCircle } from '@lucide/svelte'
  import XpBadge from './XpBadge.svelte'
  import type { ChallengeItem } from '$lib/progress/challenges'

  let {
    item,
    fresh = false,
    onreroll,
    onclaim,
  }: { item: ChallengeItem; fresh?: boolean; onreroll?: () => void; onclaim?: () => Promise<void> } = $props()
  let claiming = $state(false)
  async function claim() {
    if (!onclaim || claiming) return
    claiming = true
    await onclaim()
    claiming = false
  }
  const pct = $derived((item.progress / item.target) * 100)
  const close = $derived(!item.completed && item.target > 1 && item.target - item.progress === 1)
  // The burst's pieces: where each flies, its colour and shape
  const BURST = [
    [29, 9, 'var(--color-accent)', 'h'],
    [28, 37, 'var(--color-gold)', 'w'],
    [1, 40, 'var(--color-ice)', 'h'],
    [-19, 27, 'var(--color-live-text)', 'w'],
    [-46, 16, 'var(--color-text)', 'h'],
    [-40, -12, 'var(--color-accent)', 'w'],
    [-21, -28, 'var(--color-gold)', 'h'],
    [-1, -51, 'var(--color-ice)', 'w'],
    [25, -36, 'var(--color-live-text)', 'h'],
    [35, -12, 'var(--color-text)', 'w'],
  ] as const
</script>

{#if item.claimed}
  <li class="flex items-center gap-[14px] rounded-[12px] border border-line-2 bg-surface-row px-4 py-3 opacity-60">
    <span
      class="size-[34px] shrink-0 rounded-full border-2 border-accent-line-strong text-accent flex items-center justify-center"
      aria-hidden="true"><Check size={16} strokeWidth={2.6} /></span
    >
    <div class="flex-1 min-w-0 text-[16px] font-medium text-ink-2">{item.title}</div>
    <span class="text-[13px] text-text-muted whitespace-nowrap">Claimed</span>
    <span class="inline-flex items-center gap-[6px] font-display font-bold text-[20px] tracking-[0.04em] text-text-dim whitespace-nowrap"
      >+{item.xp}<XpBadge size={18} /></span
    >
  </li>
{:else if item.completed}
  <li class="done relative flex items-center gap-[14px] rounded-[12px] border px-4 py-3">
    <span class="relative size-[34px] shrink-0 flex items-center justify-center" aria-hidden="true">
      <span class="ring absolute inset-0 rounded-full border-2 border-accent"></span>
      <span class="{fresh ? 'stamp' : ''} size-[34px] rounded-full bg-accent text-accent-fg flex items-center justify-center"
        ><Check size={18} strokeWidth={2.8} /></span
      >
      {#if fresh}
        {#each BURST as [x, y, color, shape], i (i)}
          <span
            class="piece absolute left-1/2 top-1/2 rounded-[2px] {shape === 'h' ? 'w-1 h-[9px]' : 'w-[6px] h-1'}"
            style="background: {color}; --x: {x}px; --y: {y}px"
          ></span>
        {/each}
      {/if}
    </span>
    <div class="flex-1 min-w-0">
      <div class="text-[16px] font-medium">{item.title}</div>
      <div class="mt-[2px] text-[13px] text-accent">Complete</div>
    </div>
    <button
      type="button"
      onclick={claim}
      disabled={claiming}
      class="claim relative overflow-hidden shrink-0 inline-flex items-center gap-2 rounded-[10px] border-0 bg-accent px-4 py-[9px] text-accent-fg
             font-display font-bold text-[20px] uppercase tracking-[0.06em] whitespace-nowrap cursor-pointer hover:bg-accent-hover disabled:cursor-default"
    >
      {#if claiming}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />{/if}
      Claim +{item.xp}<XpBadge size={22} inverse />
      <span class="sheen absolute inset-y-0 left-0 w-2/5" aria-hidden="true"></span>
    </button>
  </li>
{:else}
  <li class="flex flex-col gap-[10px] rounded-[12px] border bg-surface-row px-4 py-[14px] {close ? 'border-gold-line' : 'border-line-2'}">
    <div class="flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[16px] font-medium">{item.title}</span>
          {#if item.difficulty === 'hard'}
            <span
              class="rounded-full border border-line-chip px-[9px] py-[5px] text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap"
              >Hard</span
            >
          {/if}
        </div>
        {#if item.target > 1}<div class="mt-[2px] text-[13px] text-text-muted tabular-nums">{item.progress} of {item.target}</div>{/if}
      </div>
      {#if close}<span class="shrink-0 rounded-full bg-gold px-[10px] py-1 text-[12px] font-bold text-accent-fg">1 to go</span>{/if}
      {#if item.canReroll && onreroll}
        <button
          type="button"
          onclick={onreroll}
          class="shrink-0 bg-transparent border-0 p-1 text-[12px] text-text-muted cursor-pointer font-[inherit] hover:text-text"
          aria-label="Reroll: {item.title}">Reroll</button
        >
      {/if}
      <span
        class="shrink-0 inline-flex items-center gap-[6px] whitespace-nowrap font-display font-bold text-[22px] tracking-[0.04em] text-accent"
        >+{item.xp}<XpBadge /></span
      >
    </div>
    <div
      class="h-2 rounded-full bg-surface-inset overflow-hidden"
      role="progressbar"
      aria-label="{item.progress} of {item.target}"
      aria-valuemin={0}
      aria-valuemax={item.target}
      aria-valuenow={item.progress}
    >
      <div class="fill h-full rounded-full {close ? 'gold' : ''}" style="width: {pct}%"></div>
    </div>
  </li>
{/if}

<style>
  .done {
    background: linear-gradient(90deg, rgba(198, 242, 78, 0.14), var(--color-surface-row) 70%);
    border-color: var(--color-accent-line-strong);
    box-shadow:
      0 0 0 1px rgba(198, 242, 78, 0.12),
      0 6px 24px -10px rgba(198, 242, 78, 0.5);
  }
  .fill {
    background:
      repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.16) 0 7px, transparent 7px 14px) 0 0 / 28px 100%,
      var(--color-accent);
    transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .fill.gold {
    background-color: var(--color-gold);
  }
  .claim {
    animation:
      glow 1.8s ease-in-out infinite,
      bob 2.4s ease-in-out infinite;
  }
  @keyframes bob {
    0%,
    100% {
      transform: none;
    }
    50% {
      transform: translateY(-4px);
    }
  }
  .sheen {
    background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.55), transparent);
    transform: translateX(-120%);
    animation: sheen 2.6s ease-in-out infinite;
  }
  @keyframes glow {
    0%,
    100% {
      filter: drop-shadow(0 0 2px rgba(198, 242, 78, 0.4));
    }
    50% {
      filter: drop-shadow(0 0 10px rgba(198, 242, 78, 0.9));
    }
  }
  @keyframes sheen {
    0%,
    40% {
      transform: translateX(-120%);
    }
    70%,
    100% {
      transform: translateX(220%);
    }
  }
  .stamp {
    animation: stamp 0.9s cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  .ring {
    opacity: 0;
    animation: ring 2.4s ease-out infinite;
  }
  .piece {
    opacity: 0;
    animation: burst 1.2s 0.15s ease-out both;
  }
  @keyframes stamp {
    0% {
      transform: scale(2.6) rotate(-24deg);
      opacity: 0;
    }
    60% {
      transform: scale(0.9) rotate(4deg);
      opacity: 1;
    }
    100% {
      transform: none;
      opacity: 1;
    }
  }
  @keyframes ring {
    0%,
    14% {
      transform: none;
      opacity: 0;
    }
    18% {
      opacity: 0.7;
    }
    55%,
    100% {
      transform: scale(2.4);
      opacity: 0;
    }
  }
  @keyframes burst {
    0% {
      transform: translate(-50%, -50%) scale(0.4);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    100% {
      transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(200deg);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stamp,
    .claim {
      animation: none;
    }
    .fill {
      transition: none;
    }
    .ring,
    .piece,
    .sheen {
      display: none;
    }
  }
</style>
