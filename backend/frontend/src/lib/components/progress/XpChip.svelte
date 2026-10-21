<script lang="ts">
  // The win screen's XP chip (concept: quiet win screen): level, a thin XP bar and "+N XP", always
  // there at the foot of the result. On arrival the bar fills; on a level-up it runs to the end,
  // the level flips, the chip pulses once and one line names the new level. A tap opens the full
  // breakdown. Reduced motion shows the end state.
  import { ChevronDown, Flame } from '@lucide/svelte'
  import type { GameGain } from '$lib/progress/store'
  import { chipMotion, fmtXp, levelView, lineLabel, streakLine } from '$lib/progress/view'

  let { gain }: { gain: GameGain } = $props()

  const motion = $derived(chipMotion(gain.xpBefore, gain.xpAfter))
  const after = $derived(levelView(gain.xpAfter))
  const streak = $derived(streakLine(gain.lines))
  let open = $state(false)
</script>

<div class="relative flex flex-col gap-2 w-full" class:up={motion.levelUp}>
  {#if open}
    <!-- Floats above the chip so the result keeps its place -->
    <div
      id="xp-breakdown"
      class="absolute inset-x-0 bottom-full mb-2 z-10 rounded-[14px] border border-line-popover bg-surface-2 px-[14px] pt-[6px] pb-3 shadow-popover"
    >
      {#each gain.lines as line (line.kind)}
        <div class="flex justify-between gap-3 py-[9px] border-b border-line-2 text-[14px] text-ink-2">
          <span>{lineLabel(line)}</span><b class="font-semibold text-text tabular-nums">+{fmtXp(line.amount)}</b>
        </div>
      {/each}
      <div class="flex justify-between items-baseline pt-[10px]">
        <span class="font-display font-bold text-[18px] tracking-[0.08em] uppercase">Total</span>
        <b class="font-display font-bold text-[30px] leading-none text-accent tabular-nums">+{fmtXp(gain.total)}</b>
      </div>
      <div class="mt-2 flex justify-between text-[12px] text-text-muted">
        <span>LV {after.level}</span><span>{after.toGo}</span><span>LV {after.level + 1}</span>
      </div>
    </div>
  {/if}
  {#if motion.levelUp || streak}
    <p class="lunote m-0 flex items-center gap-3 text-[13px] text-ink-2">
      {#if motion.levelUp}<b class="font-semibold text-accent">Level {motion.levelAfter}</b>{/if}
      {#if streak}
        <span class="ml-auto inline-flex items-center gap-[6px]"
          ><Flame size={14} class="text-accent" aria-hidden="true" />{streak.days}-day streak · +{fmtXp(streak.bonus)} first game today</span
        >
      {/if}
    </p>
  {/if}
  <button
    type="button"
    aria-expanded={open}
    aria-controls="xp-breakdown"
    aria-label="Level {after.level}, +{gain.total} XP. Show the breakdown"
    onclick={() => (open = !open)}
    style="--from: {motion.from}%; --to: {motion.to}%"
    class="chip w-full flex items-center gap-[10px] rounded-[12px] border bg-surface-inset px-3 py-[10px] text-left text-text cursor-pointer font-[inherit]
           {motion.levelUp ? 'border-accent' : 'border-line-2 hover:border-line-strong'}"
  >
    <span
      class="lv relative h-[22px] min-w-[54px] overflow-hidden whitespace-nowrap font-display font-bold text-[18px] leading-[22px] tracking-[0.06em]"
    >
      {#if motion.levelUp}<span class="o absolute inset-0" aria-hidden="true">LV {motion.levelBefore}</span>{/if}
      <span class="n block">LV {motion.levelAfter}</span>
    </span>
    <span class="relative flex-1 h-[6px] rounded-full bg-surface-chip overflow-hidden" aria-hidden="true">
      <i class="bar absolute inset-y-0 left-0 rounded-full bg-accent"></i>
    </span>
    <span class="gain whitespace-nowrap text-[13px] font-semibold text-accent">+{fmtXp(gain.total)} XP</span>
    <ChevronDown size={16} class="shrink-0 text-text-muted transition-transform {open ? 'rotate-180' : ''}" />
  </button>
</div>

<style>
  .bar {
    width: var(--to);
    animation: fill 1.1s 0.3s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .gain {
    animation: gain-in 0.6s 0.1s both;
  }
  .up .bar {
    animation: fill-up 1.7s 0.3s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .up .o {
    animation: lv-out 0.35s 1.15s both;
  }
  .up .n {
    animation: lv-in 0.35s 1.15s both;
  }
  .up .chip {
    animation: pulse 0.7s 1.2s;
  }
  .up .lunote {
    animation: gain-in 0.5s 1.6s both;
  }
  @keyframes fill {
    from {
      width: var(--from);
    }
  }
  @keyframes fill-up {
    0% {
      width: var(--from);
    }
    55% {
      width: 100%;
    }
    56% {
      width: 0;
    }
    100% {
      width: var(--to);
    }
  }
  @keyframes gain-in {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
  }
  @keyframes lv-out {
    to {
      transform: translateY(-100%);
      opacity: 0;
    }
  }
  @keyframes lv-in {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
  }
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(198, 242, 78, 0.55);
    }
    100% {
      box-shadow: 0 0 0 16px rgba(198, 242, 78, 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar,
    .gain,
    .up .bar,
    .up .n,
    .up .chip,
    .up .lunote {
      animation: none;
    }
    .o {
      display: none;
    }
  }
</style>
